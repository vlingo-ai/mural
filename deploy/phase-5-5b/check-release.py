#!/usr/bin/env python3
"""Read-only release/container identity gate. No pulls, no raw Docker output."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import time


def sibling(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manifest_schema = sibling('check-manifest')
container_gate = sibling('check-container')


def docker_json(args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError('docker_read_failed')
    return json.loads(result.stdout)


def verify_service(project, service, expected, read=docker_json):
    containers = read(['container', 'ls', '--all', '--filter', 'label=com.docker.compose.project=' + project,
                       '--filter', 'label=com.docker.compose.service=' + service, '--format', 'json'])
    # Collection wrapper normalizes Docker's JSON-lines list below.
    if not isinstance(containers, list) or len(containers) != 1:
        return 'container_count'
    record = read(['inspect', containers[0]['ID']])
    reason = container_gate.evaluate(service, record)
    if reason:
        return reason
    current = record[0]
    if current['Config']['Labels'].get('com.docker.compose.project') != project:
        return 'project_mismatch'
    images = read(['image', 'inspect', expected['image']])
    if not isinstance(images, list) or len(images) != 1:
        return 'image_count'
    image = images[0]
    if image['Id'] != current['Image']:
        return 'image_mismatch'
    if image['Os'] + '/' + image['Architecture'] != expected['platform']:
        return 'platform_mismatch'
    if expected['image_kind'] == 'registry_digest':
        if expected['image'] not in image.get('RepoDigests', []):
            return 'registry_digest_missing'
    elif image['Id'] != expected['image']:
        return 'local_id_mismatch'
    return None


def collect(args):
    if args[:2] != ['container', 'ls']:
        return docker_json(args)
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError('docker_read_failed')
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def main():
    started = time.monotonic()
    checks = []
    try:
        if len(sys.argv) != 3 or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}', sys.argv[2]):
            raise ValueError('input')
        with open(sys.argv[1]) as source:
            manifest = json.load(source)
        if not manifest_schema.validate(manifest):
            raise ValueError('manifest')
        for service in sorted(manifest_schema.SERVICES):
            try:
                reason = verify_service(sys.argv[2], service, manifest['services'][service], collect)
                checks.append({'service': service, 'status': 'FAIL' if reason else 'PASS', 'reason': reason})
            except Exception:
                checks.append({'service': service, 'status': 'UNKNOWN', 'reason': 'collection_failed'})
    except Exception:
        checks.append({'service': 'input', 'status': 'UNKNOWN', 'reason': 'invalid_manifest_or_arguments'})
    passed = all(check['status'] == 'PASS' for check in checks)
    print(json.dumps({'schema_version': 1, 'check': 'release_runtime_identity',
                      'status': 'PASS' if passed else 'FAIL', 'checks': checks,
                      'elapsed_ms': round((time.monotonic() - started) * 1000)}))
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
