"""Regression tests for the smoke assertions, including false-positive cases."""

import io
from unittest import TestCase, main
from unittest.mock import patch
from urllib.error import HTTPError

import check


class HttpTests(TestCase):
    def test_wrong_status_fails(self):
        response = HTTPError("http://test", 500, "failure", {}, io.BytesIO(b"broken"))
        with patch.object(check, "urlopen", side_effect=response):
            with self.assertRaisesRegex(AssertionError, "expected 201, got 500: broken"):
                check.request("http://test", method="POST", body={"name": "test"}, status=201)

    def test_expected_error_status_is_allowed(self):
        response = HTTPError("http://test", 404, "missing", {}, io.BytesIO(b"missing"))
        with patch.object(check, "urlopen", side_effect=response):
            self.assertEqual(check.request("http://test", status=404), "missing")


class AssertionTests(TestCase):
    def test_empty_metrics_and_zero_samples_fail(self):
        for rows in ([], [{"value": [1, "0"]}], [{"value": [1, "NaN"]}]):
            with self.subTest(rows=rows), patch.object(check, "get_json", return_value={
                "status": "success", "data": {"result": rows}
            }):
                with self.assertRaisesRegex(AssertionError, "No positive sample"):
                    check.check_metric("test")

    def test_positive_metric_passes(self):
        with patch.object(check, "get_json", return_value={
            "status": "success", "data": {"result": [{"value": [1, "2"]}]}
        }):
            check.check_metric("test")

    def test_empty_or_wrong_trace_fails(self):
        for trace in ({}, {"batches": [{
            "resource": {"attributes": [{
                "key": "service.name", "value": {"stringValue": "another-service"},
            }]},
            "scopeSpans": [{"spans": [{"name": "GET"}]}],
        }]}):
            with self.subTest(trace=trace), patch.object(check, "get_json", return_value=trace):
                with self.assertRaisesRegex(AssertionError, "did not return server spans"):
                    check.check_trace("123")

    def test_server_trace_passes(self):
        with patch.object(check, "get_json", return_value={"batches": [{
            "resource": {"attributes": [{
                "key": "service.name", "value": {"stringValue": "mythical-server"},
            }]},
            "scopeSpans": [{"spans": [{"name": "GET"}]}],
        }]}):
            check.check_trace("123")

    def test_metadata_only_profiles_fail(self):
        with patch.object(check, "get_json", return_value={
            "series": [{"labels": [{"name": "service_name", "value": "mythical-server"}]}]
        }):
            with self.assertRaisesRegex(AssertionError, "no positive CPU profile samples"):
                check.check_profile("mythical-server", 0)

    def test_zero_profiles_fail(self):
        with patch.object(check, "get_json", return_value={
            "series": [{"points": [{"value": 0}]}]
        }):
            with self.assertRaises(AssertionError):
                check.check_profile("mythical-server", 0)

    def test_positive_profiles_pass(self):
        with patch.object(check, "get_json", return_value={
            "series": [{"points": [{"value": 10}]}]
        }) as query:
            check.check_profile("mythical-server", 0)
        body = query.call_args.kwargs["body"]
        self.assertEqual(body["profileTypeID"], "wall:cpu:nanoseconds:wall:nanoseconds")
        self.assertEqual(body["labelSelector"], '{service_name="mythical-server"}')

    def test_unrelated_log_fails(self):
        with patch.object(check, "get_json", return_value={
            "status": "success", "data": {"result": [{"values": [[1, "startup"]]}]}
        }):
            with self.assertRaisesRegex(AssertionError, "did not receive the smoke request"):
                check.check_log("123", 0)

    def test_smoke_log_passes(self):
        with patch.object(check, "get_json", return_value={
            "status": "success", "data": {"result": [{
                "values": [[1, "traceID=123 status=SUCCESS"]]
            }]}
        }):
            check.check_log("123", 0)

    def test_wrong_get_response_fails(self):
        with patch.object(check, "get_json", return_value={"error": "failed"}):
            with self.assertRaisesRegex(AssertionError, "expected an array"):
                check.names_at("http://test")

    def test_missing_created_row_fails(self):
        with patch.object(check, "names_at", return_value=[]), patch.object(check, "request"):
            with self.assertRaisesRegex(AssertionError, "POST did not persist"):
                check.check_crud("http://test")

    def test_undeleted_row_fails(self):
        with patch.object(check.uuid, "uuid4") as new_id:
            new_id.return_value.hex = "a" * 32
            with patch.object(check, "names_at", side_effect=[
                [], ["smoke_" + "a" * 32], ["smoke_" + "a" * 32], ["smoke_" + "a" * 32]
            ]), patch.object(check, "request"):
                with self.assertRaisesRegex(AssertionError, "DELETE did not remove"):
                    check.check_crud("http://test")

    def test_grafana_accepts_migrated_pyroscope_type(self):
        for kind in ("phlare", "grafana-pyroscope-datasource"):
            with self.subTest(kind=kind), patch.object(check, "get_json", side_effect=[
                {"database": "ok"},
                [{"uid": uid, "type": source_type, "url": url} for uid, source_type, url in (
                    ("mimir", "prometheus", "http://mimir:9009/prometheus"),
                    ("loki", "loki", "http://loki:3100"),
                    ("tempo", "tempo", "http://tempo:3200"),
                    ("pyroscope", kind, "http://pyroscope:4040"),
                )],
                {"dashboard": {"panels": [{}]}},
            ]):
                check.check_grafana()

    def test_grafana_incorrect_data_source_url_fails(self):
        with patch.object(check, "get_json", side_effect=[
            {"database": "ok"},
            [{"uid": uid, "type": kind, "url": "http://wrong-host"} for uid, kind in (
                ("mimir", "prometheus"), ("loki", "loki"),
                ("tempo", "tempo"), ("pyroscope", "grafana-pyroscope-datasource"),
            )],
        ]):
            with self.assertRaisesRegex(AssertionError, "Incorrect provisioned data source URLs"):
                check.check_grafana()

    def test_grafana_missing_data_source_fails(self):
        with patch.object(check, "get_json", side_effect=[{"database": "ok"}, []]):
            with self.assertRaisesRegex(AssertionError, "Missing or incorrect"):
                check.check_grafana()

    def test_frontend_html_instead_of_bundle_fails(self):
        with patch.object(check, "request", side_effect=[
            '<div id="root"></div><script src="/static/main.js"></script>', "<html>404</html>"
        ]):
            with self.assertRaisesRegex(AssertionError, "bundle is empty or HTML"):
                check.check_frontend()


class RetryTests(TestCase):
    def test_retries_eventually_successful_check(self):
        attempts = []
        def eventually():
            attempts.append(1)
            check.require(len(attempts) == 2, "not yet")

        with patch.object(check.time, "sleep"):
            check.wait_for_checks({"eventually": eventually}, timeout=10)
        self.assertEqual(len(attempts), 2)

    def test_timeout_reports_last_failure(self):
        def never():
            raise AssertionError("missing telemetry")

        with self.assertRaisesRegex(AssertionError, "missing telemetry"):
            check.wait_for_checks({"never": never}, timeout=0)


if __name__ == "__main__":
    main()
