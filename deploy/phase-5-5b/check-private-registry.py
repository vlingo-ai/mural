#!/usr/bin/env python3
"""Read-only remote manifest access gate. Never print credentials or responses."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys


def check(manifest, run=subprocess.run):
    spec = importlib.util.spec_from_file_location('manifest_schema', Path(__file__).with_name('check-manifest.py'))
    schema = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(schema)
    if not schema.validate(manifest):
        return False
    images = set()
    for service in ('api', 'agent-worker', 'agent-worker-replay'):
        item = manifest['services'][service]
        if item['image_kind'] != 'registry_digest' or not item['image'].startswith('ghcr.io/vlingo-ai/'):
            return False
        images.add(item['image'])
    for image in sorted(images):
        try:
            result = run(['docker', 'manifest', 'inspect', image], capture_output=True,
                         text=True, timeout=30, stdin=subprocess.DEVNULL)
            if result.returncode != 0 or not isinstance(json.loads(result.stdout), dict):
                return False
        except (OSError, subprocess.TimeoutExpired, ValueError):
            return False
    return True


if __name__ == '__main__':
    try:
        with open(sys.argv[1]) as source:
            passed = check(json.load(source)) if len(sys.argv) == 2 else False
    except (OSError, ValueError, IndexError):
        passed = False
    print('private_registry_access: ' + ('PASS' if passed else 'FAIL'))
    sys.exit(0 if passed else 1)
