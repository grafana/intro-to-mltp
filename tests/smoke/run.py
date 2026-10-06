"""Build and test an isolated local stack, then collect diagnostics and clean up."""

import os
import signal
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APPLICATIONS = (
    "mythical-server", "mythical-requester", "mythical-recorder", "mythical-frontend"
)


def command(args, *, env, timeout, output=None):
    print("+ " + " ".join(args), flush=True)
    subprocess.run(
        args, cwd=ROOT, env=env, timeout=timeout, check=True,
        stdout=output, stderr=subprocess.STDOUT,
    )


def run():
    project = "mltp-smoke-" + uuid.uuid4().hex[:12]
    env = dict(os.environ, COMPOSE_PROJECT_NAME=project, COMPOSE_PROFILES="")
    artifacts = Path(env.get("SMOKE_ARTIFACT_DIR", ROOT / "tests/artifacts" / project))
    artifacts = artifacts.resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    compose = [
        "docker", "compose", "--project-name", project,
        "-f", str(ROOT / "docker-compose.yml"),
        "-f", str(ROOT / "tests/smoke/compose.yml"),
    ]
    print(f"Project: {project}\nDiagnostics: {artifacts}", flush=True)
    result = 0
    started = False

    # Convert CI cancellation to an exception so the finally block still runs.
    def terminate(signum, frame):
        raise KeyboardInterrupt

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        command(compose + ["version"], env=env, timeout=30)
        with (artifacts / "compose.json").open("w") as output:
            command(compose + ["--profile", "test", "config", "--format", "json"],
                    env=env, timeout=30, output=output)
        command(compose + ["build", *APPLICATIONS], env=env, timeout=900)
        command(compose + ["--profile", "test", "pull", "--ignore-buildable"],
                env=env, timeout=600)
        started = True
        command(compose + ["up", "-d", "--no-build", "--pull", "never"],
                env=env, timeout=180)
        command(compose + ["run", "--rm", "--no-deps", "-T", "smoke"],
                env=env, timeout=480)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        result = 1
    except KeyboardInterrupt:
        print("Smoke test interrupted.", file=sys.stderr, flush=True)
        result = 130
    finally:
        if started:
            for filename, args in (
                ("containers.json", ["ps", "--all", "--format", "json"]),
                ("compose.log", ["logs", "--no-color", "--timestamps"]),
            ):
                try:
                    with (artifacts / filename).open("w") as output:
                        command(compose + args, env=env, timeout=60, output=output)
                except (subprocess.SubprocessError, OSError) as error:
                    print(f"Could not collect {filename}: {error}", file=sys.stderr)
            try:
                command(compose + ["down", "--volumes", "--remove-orphans", "--timeout", "10"],
                        env=env, timeout=120)
            except (subprocess.SubprocessError, OSError) as error:
                print(f"Cleanup failed for {project}: {error}", file=sys.stderr)
                result = result or 1
        signal.signal(signal.SIGTERM, previous)
    return result


if __name__ == "__main__":
    sys.exit(run())
