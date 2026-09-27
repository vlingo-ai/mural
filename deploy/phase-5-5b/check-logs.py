"""Read-only bounded log-pattern gate. Never emit raw logs or Docker errors."""
import re
import subprocess
import sys


def check(env_file, run=subprocess.run):
    try:
        result = run(['docker', 'compose', '--env-file', env_file, 'logs', '--since', '15m',
                      'api', 'model-gateway', 'agent-worker', 'agent-worker-replay'],
                     capture_output=True, timeout=20)
        if result.returncode:
            return 'collection_failed'
        if re.search(rb'OPENAI_API_KEY=|LIVEKIT_API_SECRET=|MURAL_CONTROL_OUTBOX_KEY=|'
                     rb'Authorization: Bearer |DATABASE_URL=', result.stdout + result.stderr):
            return 'sensitive_pattern'
        return None
    except Exception:
        return 'collection_failed'


if __name__ == '__main__':
    reason = check(sys.argv[1]) if len(sys.argv) == 2 else 'invalid_arguments'
    print('log_pattern_scan: ' + ('FAIL ' + reason if reason else 'PASS'))
    sys.exit(1 if reason else 0)
