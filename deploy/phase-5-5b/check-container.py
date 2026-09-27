#!/usr/bin/env python3
"""Evaluate docker inspect in memory. Never echo raw inspect/configuration."""
import json
import sys

SERVICES = {'database', 'model-gateway', 'api', 'agent-worker', 'agent-worker-replay', 'edge'}
HEALTH_REQUIRED = {'database', 'model-gateway', 'api'}


def evaluate(service, records):
    if service not in SERVICES or not isinstance(records, list) or len(records) != 1:
        return 'invalid_input'
    try:
        container = records[0]
        if container['Config']['Labels']['com.docker.compose.service'] != service:
            return 'service_mismatch'
        state = container['State']
        if state['Status'] != 'running' or state['Running'] is not True:
            return 'not_running'
        if state.get('Paused', False) or state.get('Restarting', False) or state.get('OOMKilled', False):
            return 'abnormal_state'
        restarts = container['RestartCount']
        if type(restarts) is not int or restarts != 0:
            return 'restart_count_nonzero_or_unknown'
        health = state.get('Health')
        if service in HEALTH_REQUIRED and not health:
            return 'health_missing'
        if health is not None and health.get('Status') != 'healthy':
            return 'not_healthy'
    except (KeyError, TypeError, AttributeError):
        return 'invalid_input'
    return None


def main():
    service = sys.argv[1] if len(sys.argv) == 2 else ''
    try:
        reason = evaluate(service, json.load(sys.stdin))
    except (ValueError, TypeError):
        reason = 'invalid_input'
    # Only fixed allowlisted labels and reason codes leave the process.
    label = service if service in SERVICES else 'unknown'
    print(f'verify: {label} ' + (f'FAIL ({reason})' if reason else 'container PASS'))
    return 1 if reason else 0


if __name__ == '__main__':
    sys.exit(main())
