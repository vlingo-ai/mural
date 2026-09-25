"""Select non-billable CI jobs from the accepted project stage and Git diff."""
import argparse
import json
import os
from pathlib import Path
import subprocess


PLATFORMS = {"web", "ios", "android"}


def select(stage, paths, requested="active", force=False):
    if stage not in PLATFORMS or requested not in PLATFORMS | {"active", "all"}:
        raise ValueError("Unknown CI platform; refusing to skip checks")
    active = PLATFORMS if requested == "all" else {stage if requested == "active" else requested}
    # Markdown is documentation, not executable/build input in these trees.
    code = [p for p in paths if not p.lower().endswith(".md")]
    policy = any(p.startswith(".github/") or p in {
        "scripts/ci_scope.py", "scripts/tests/test_ci_scope.py"
    } for p in code)
    full = force or policy
    shared = any(p.startswith("shared/") for p in code)
    server = full or shared or any(p.startswith("services/api/") for p in code)
    deploy = full or server or any(p.startswith("deploy/") for p in code)
    web = full or shared or server or deploy or any(p.startswith("apps/web/") for p in code)
    ios = full or shared or server or any(
        p.startswith("apps/ios/") or p == "scripts/generate_project.py" for p in code
    )
    android = full or shared or server or any(
        p.startswith("apps/android/") or p == "scripts/export_android_content.py" for p in code
    )
    release = full or android or any(p.startswith("release/android/") or p in {
        "scripts/check_android_release.py", "scripts/tests/test_check_android_release.py"
    } for p in paths)
    return {
        "web": "web" in active and web,
        "swift": "ios" in active and ios,
        "android": "android" in active and android,
        "android_release": "android" in active and release,
        "server": server,
        "deployment": deploy,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", default="active")
    args = parser.parse_args()
    config = json.loads(Path(".github/ci-stage.json").read_text())
    event = os.environ["GITHUB_EVENT_NAME"]
    base = os.environ.get("CI_BASE", "")
    head = os.environ["CI_HEAD"]
    force = event == "workflow_dispatch" or (event == "push" and (not base or set(base) == {"0"}))
    if not force and not base:
        raise ValueError("Missing Git base; refusing to skip checks")
    paths = [] if force else subprocess.check_output([
        "git", "diff", "--name-only", "--no-renames", "-z", base, head, "--"
    ]).decode().split("\0")
    result = select(config["platform"], paths, args.platform, force)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for key, value in result.items():
            output.write(f"{key}={str(value).lower()}\n")
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(f"## CI scope\nPhase: {config['phase']}; active platform: {config['platform']}\n\n")
        summary.write(f"Requested: {args.platform}; full selected-platform checks: {force}\n\n")
        for key, value in result.items():
            summary.write(f"- {key}: {'RUN' if value else 'NOT_APPLICABLE (stage/change scope)'}\n")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
