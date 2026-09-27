#!/usr/bin/env python3
"""Validate public release identity metadata; never print input values."""
import json
import re
import sys

SERVICES = {'api', 'edge', 'agent-worker', 'agent-worker-replay', 'model-gateway', 'database'}
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')
COMMIT = re.compile(r'[0-9a-f]{40}\Z')
REGISTRY = re.compile(r'[a-z0-9][a-z0-9./_-]*@sha256:[0-9a-f]{64}\Z')


def validate(body):
    if not isinstance(body, dict) or set(body) != {'schema_version', 'release_id', 'services'}:
        return False
    if type(body['schema_version']) is not int or body['schema_version'] != 1:
        return False
    if not isinstance(body['release_id'], str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', body['release_id']):
        return False
    services = body['services']
    if not isinstance(services, dict) or set(services) != SERVICES:
        return False
    for service, item in services.items():
        if not isinstance(item, dict) or set(item) != {'source_commit', 'image_kind', 'image', 'platform', 'ci_run'}:
            return False
        # Database upstream image has no project source/CI identity; app images must.
        if service == 'database':
            if item['source_commit'] is not None or item['ci_run'] is not None:
                return False
        elif not isinstance(item['source_commit'], str) or not COMMIT.fullmatch(item['source_commit']):
            return False
        elif type(item['ci_run']) is not int or item['ci_run'] <= 0:
            return False
        if item['platform'] != 'linux/amd64' or not isinstance(item['image'], str):
            return False
        if not isinstance(item['image_kind'], str):
            return False
        pattern = {'registry_digest': REGISTRY, 'local_image_id': DIGEST}.get(item['image_kind'])
        if pattern is None or not pattern.fullmatch(item['image']):
            return False
    return True


if __name__ == '__main__':
    try:
        valid = validate(json.load(sys.stdin))
    except (ValueError, TypeError):
        valid = False
    print('manifest schema: ' + ('PASS' if valid else 'FAIL'))
    sys.exit(0 if valid else 1)
