"""HTTP assertions against the demo stack. Uses only the Python standard library."""

import json
import re
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import PurePosixPath
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

BEASTS = ("unicorn", "manticore", "illithid", "owlbear", "beholder")
SERVICES = ("mythical-server", "mythical-requester", "mythical-recorder")
# The Node SDK's wall profiler emits CPU samples when collectCpuTime is enabled.
PROFILE_TYPE = "wall:cpu:nanoseconds:wall:nanoseconds"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def request(url, *, method="GET", body=None, headers=None, status=200):
    data = None if body is None else json.dumps(body).encode()
    headers = dict(headers or {})
    if data is not None:
        headers["Content-Type"] = "application/json"
        headers["Connect-Protocol-Version"] = "1"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=5) as response:
            code, text = response.status, response.read().decode()
    except HTTPError as error:
        with error:
            code, text = error.code, error.read().decode()
    require(code == status, f"{method} {url}: expected {status}, got {code}: {text[:500]}")
    return text


def get_json(url, **kwargs):
    return json.loads(request(url, **kwargs))


def wait_for_checks(checks, timeout):
    """Retry ingestion/readiness checks, retaining the last failure for each check."""
    pending = dict(checks)
    errors = {}
    deadline = time.monotonic() + timeout

    def attempt(item):
        name, check = item
        try:
            check()
            return name, None
        except (AssertionError, OSError, ValueError, KeyError, TypeError) as error:
            return name, f"{type(error).__name__}: {error}"

    while pending:
        with ThreadPoolExecutor(max_workers=len(pending)) as pool:
            for name, error in pool.map(attempt, list(pending.items())):
                if error is None:
                    print(f"PASS: {name}", flush=True)
                    del pending[name]
                else:
                    errors[name] = error
        if not pending:
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            details = "\n".join(f"  {name}: {errors[name]}" for name in pending)
            raise AssertionError(f"Timed out after {timeout}s:\n{details}")
        print("Waiting for: " + ", ".join(pending), flush=True)
        time.sleep(min(5, remaining))


def names_at(url, **kwargs):
    rows = get_json(url, **kwargs)
    require(isinstance(rows, list), f"{url}: expected an array, got {rows!r}")
    require(all(isinstance(row, dict) and isinstance(row.get("name"), str) for row in rows),
            f"{url}: expected rows with string names, got {rows!r}")
    return [row["name"] for row in rows]


def check_crud(base_url):
    # The requester never deletes unicorns, so concurrent demo traffic cannot erase
    # our fixture. A fresh name also keeps other requester traffic out of this check.
    url = base_url + "/unicorn"
    name = "smoke_" + uuid.uuid4().hex
    body = {"name": name}
    require(name not in names_at(url), "Smoke fixture already exists")
    request(url, method="POST", body=body, status=201)
    require(names_at(url).count(name) == 1, f"POST did not persist exactly one {name}")
    trace_id = uuid.uuid4().hex
    span_id = uuid.uuid4().hex[:16]
    require(name in names_at(url, headers={"traceparent": f"00-{trace_id}-{span_id}-01"}),
            f"GET lost {name}")
    request(url, method="DELETE", body=body, status=204)
    require(name not in names_at(url), f"DELETE did not remove {name}")
    request(base_url + "/not-a-beast", status=404)
    print(f"PASS: CRUD through {base_url}", flush=True)
    return trace_id


def check_frontend():
    base = "http://mythical-frontend"
    html = request(base + "/")
    require('id="root"' in html, "Frontend HTML does not contain the React root")
    scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
    require(scripts, "Frontend HTML does not reference a JavaScript bundle")
    for script in scripts:
        url = urljoin(base + "/", script)
        require(urlparse(url).netloc == "mythical-frontend", f"Unexpected bundle URL: {url}")
        content = request(url)
        require(content.strip() and not content.lstrip().startswith("<"),
                f"Frontend bundle is empty or HTML: {PurePosixPath(script).name}")


def check_grafana():
    health = get_json("http://grafana:3000/api/health")
    require(health.get("database") == "ok", f"Grafana database is not ready: {health}")
    sources = get_json("http://grafana:3000/api/datasources")
    expected = {
        "mimir": {"prometheus"}, "loki": {"loki"}, "tempo": {"tempo"},
        # Grafana migrates the historical phlare identifier during provisioning.
        "pyroscope": {"phlare", "grafana-pyroscope-datasource"},
    }
    actual = {source["uid"]: source["type"] for source in sources}
    require(all(actual.get(uid) in kinds for uid, kinds in expected.items()),
            f"Missing or incorrect provisioned data sources: {actual}")
    urls = {source["uid"]: source.get("url", "").rstrip("/") for source in sources}
    expected_urls = {
        "mimir": "http://mimir:9009/prometheus", "loki": "http://loki:3100",
        "tempo": "http://tempo:3200", "pyroscope": "http://pyroscope:4040",
    }
    require(all(urls.get(uid) == url for uid, url in expected_urls.items()),
            f"Incorrect provisioned data source URLs: {urls}")
    dashboard = get_json(
        "http://grafana:3000/api/dashboards/uid/ed4f4709-4d3b-48fd-a311-a036b85dbd5b"
    )
    require(dashboard.get("dashboard", {}).get("panels"), "MLT dashboard has no panels")


def check_metric(query):
    result = get_json("http://mimir:9009/prometheus/api/v1/query?" + urlencode({"query": query}))
    require(result.get("status") == "success", f"Mimir query failed: {result}")
    rows = result.get("data", {}).get("result", [])
    require(any(float(row["value"][1]) > 0 for row in rows),
            f"No positive sample for {query}: {rows}")


def check_recording():
    text = request("http://mythical-recorder:4002/metrics")
    samples = re.findall(r"^mythical_messages_recorded(?:_total)?\s+([0-9.eE+-]+)", text, re.MULTILINE)
    require(any(float(value) > 0 for value in samples), "Recorder did not consume any queue messages")


def check_log(trace_id, start):
    query = '{service_name="mythical-server"} |= "traceID=' + trace_id + '"'
    result = get_json("http://loki:3100/loki/api/v1/query_range?" + urlencode({
        "query": query, "start": str(start), "end": str(time.time_ns()), "limit": 10,
    }))
    require(result.get("status") == "success", f"Loki query failed: {result}")
    lines = [line for stream in result.get("data", {}).get("result", [])
             for _, line in stream.get("values", [])]
    require(any(f"traceID={trace_id}" in line and "status=SUCCESS" in line for line in lines),
            f"Loki did not receive the smoke request log for {trace_id}")


def check_trace(trace_id):
    trace = get_json(f"http://tempo:3200/api/traces/{trace_id}",
                     headers={"Accept": "application/json"})
    # Tempo's JSON uses batches for the OTLP ResourceSpans field.
    batches = trace.get("batches", trace.get("resourceSpans", []))
    for batch in batches:
        attributes = batch.get("resource", {}).get("attributes", [])
        server = any(attr.get("key") == "service.name"
                     and attr.get("value", {}).get("stringValue") == "mythical-server"
                     for attr in attributes)
        scopes = batch.get("scopeSpans", batch.get("instrumentationLibrarySpans", []))
        if server and any(scope.get("spans") for scope in scopes):
            return
    raise AssertionError(f"Tempo did not return server spans for the smoke trace {trace_id}")


def check_service_trace(service, start):
    result = get_json("http://tempo:3200/api/search?" + urlencode({
        "q": '{ resource.service.name = "' + service + '" }',
        "start": start // 1_000_000_000, "end": time.time_ns() // 1_000_000_000,
        "limit": 1,
    }))
    require(result.get("traces"), f"Tempo has no traces from {service}")


def check_profile(service, start):
    result = get_json(
        "http://pyroscope:4040/querier.v1.QuerierService/SelectSeries",
        method="POST", body={
            "profileTypeID": PROFILE_TYPE,
            "labelSelector": '{service_name="' + service + '"}',
            "start": str(start // 1_000_000), "end": str(time.time_ns() // 1_000_000),
            "step": 10,
        },
    )
    points = [point for series in result.get("series", []) for point in series.get("points", [])]
    require(any(float(point.get("value", 0)) > 0 for point in points),
            f"Pyroscope has no positive CPU profile samples from {service}")


def main():
    start = time.time_ns()
    endpoints = {
        "Alloy ready": "http://alloy:12345/-/ready",
        "Mimir ready": "http://mimir:9009/ready",
        "Loki ready": "http://loki:3100/ready",
        "Tempo ready": "http://tempo:3200/ready",
        "Pyroscope ready": "http://pyroscope:4040/ready",
    }
    readiness = {name: (lambda url=url: request(url)) for name, url in endpoints.items()}
    readiness.update({
        "API ready": lambda: names_at("http://mythical-server:4000/unicorn"),
        "Frontend bundles": check_frontend,
        "Grafana provisioning": check_grafana,
    })
    wait_for_checks(readiness, timeout=180)
    for beast in BEASTS:
        names_at("http://mythical-server:4000/" + beast)
    trace_id = check_crud("http://mythical-server:4000")
    proxy_trace_id = check_crud("http://mythical-frontend/api")

    checks = {
        "Mimir requester metrics": lambda: check_metric("mythical_danger_level_30s"),
        "Tempo span metrics in Mimir": lambda: check_metric(
            'traces_spanmetrics_calls_total{service="mythical-server"}'
        ),
        "Queue consumption": check_recording,
        "Smoke log in Loki": lambda: check_log(trace_id, start),
        "Smoke trace in Tempo": lambda: check_trace(trace_id),
        "Frontend proxy trace in Tempo": lambda: check_trace(proxy_trace_id),
    }
    for method, status in (("GET", "200"), ("POST", "201"), ("DELETE", "204")):
        query = ('mythical_request_times_count{beast="unicorn",method="'
                 + method + '",status="' + status + '"}')
        checks[f"Mimir {method} metrics"] = lambda query=query: check_metric(query)
    for service in SERVICES:
        checks[f"CPU profiles: {service}"] = (
            lambda service=service: check_profile(service, start)
        )
    for service in ("mythical-requester", "mythical-recorder"):
        checks[f"Traces: {service}"] = (
            lambda service=service: check_service_trace(service, start)
        )
    wait_for_checks(checks, timeout=180)
    print("PASS: stack smoke test", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, ValueError, KeyError, TypeError) as error:
        print(f"FAIL: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
