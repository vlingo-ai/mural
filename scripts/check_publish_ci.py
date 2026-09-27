"""Require successful latest main push CI on the exact release SHA."""
import json
import os
import re
import subprocess
import sys


def accepted(runs, sha):
    candidates = [run for run in runs if run.get('head_sha') == sha
                  and run.get('head_branch') == 'main' and run.get('event') == 'push']
    if not candidates:
        return False
    latest = max(candidates, key=lambda run: (run['run_number'], run.get('run_attempt', 1)))
    return latest.get('status') == 'completed' and latest.get('conclusion') == 'success'


def main():
    try:
        repo, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
        assert re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo)
        assert re.fullmatch(r'[0-9a-f]{40}', sha)
        assert os.environ['GITHUB_REF'] == 'refs/heads/main'
        assert sys.argv[1:]
        for workflow in sys.argv[1:]:
            assert re.fullmatch(r'[a-z-]+\.yml', workflow)
            result = subprocess.run(
                ['gh', 'api', f'repos/{repo}/actions/workflows/{workflow}/runs?'
                 f'head_sha={sha}&event=push&per_page=100'],
                capture_output=True, text=True, timeout=30, check=True)
            assert accepted(json.loads(result.stdout)['workflow_runs'], sha)
    except Exception:
        print('publish_ci: FAIL (missing, pending, failed or unreadable exact-SHA checks)')
        return 1
    print('publish_ci: PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
