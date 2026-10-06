"""Test the runner's isolation, failure handling, and cleanup without Docker."""

import os
import subprocess
import tempfile
from unittest import TestCase, main
from unittest.mock import patch

import run


class RunnerTests(TestCase):
    def exercise(self, failed_step=None):
        calls = []
        def invoke(args, **kwargs):
            calls.append((args, kwargs))
            if failed_step and failed_step in args:
                raise subprocess.CalledProcessError(1, args)

        with tempfile.TemporaryDirectory() as artifacts:
            with patch.dict(os.environ, {"SMOKE_ARTIFACT_DIR": artifacts}), \
                    patch.object(run, "command", side_effect=invoke), patch("builtins.print"):
                result = run.run()
            return result, calls

    def test_success_cleans_up_and_uses_unique_project(self):
        result, calls = self.exercise()
        self.assertEqual(result, 0)
        self.assertIn("down", calls[-1][0])
        self.assertIn("--volumes", calls[-1][0])
        projects = {kwargs["env"]["COMPOSE_PROJECT_NAME"] for _, kwargs in calls}
        self.assertEqual(len(projects), 1)
        self.assertTrue(next(iter(projects)).startswith("mltp-smoke-"))
        self.assertTrue(all(kwargs["env"]["COMPOSE_PROFILES"] == "" for _, kwargs in calls))

    def test_checker_failure_still_collects_logs_and_cleans_up(self):
        result, calls = self.exercise("run")
        self.assertEqual(result, 1)
        self.assertTrue(any("logs" in args for args, _ in calls))
        self.assertIn("down", calls[-1][0])

    def test_partial_startup_failure_still_cleans_up(self):
        result, calls = self.exercise("up")
        self.assertEqual(result, 1)
        self.assertIn("down", calls[-1][0])

    def test_build_failure_never_starts_stack(self):
        result, calls = self.exercise("build")
        self.assertEqual(result, 1)
        self.assertFalse(any("up" in args for args, _ in calls))


if __name__ == "__main__":
    main()
