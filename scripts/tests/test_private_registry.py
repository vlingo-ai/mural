import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('private_registry', ROOT / 'deploy/phase-5-5b/check-private-registry.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateRegistryTests(unittest.TestCase):
    def test_cli_failure_blocks_following_command(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / 'docker'
            fake.write_text('#!/bin/sh\necho unauthorized >&2\nexit 1\n')
            fake.chmod(0o700)
            marker = Path(directory) / 'would-switch'
            env = dict(os.environ, PATH=directory + os.pathsep + os.environ['PATH'])
            result = subprocess.run(['sh', '-c', 'python3 "$1" "$2" && touch "$3"', 'gate-test',
                str(ROOT / 'deploy/phase-5-5b/check-private-registry.py'),
                str(ROOT / 'verification/b7-release-manifest.json'), str(marker)],
                env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(marker.exists())
            self.assertEqual(result.stdout.strip(), 'private_registry_access: FAIL')

    def setUp(self):
        self.manifest = json.loads((ROOT / 'verification/b7-release-manifest.json').read_text())

    def test_success_checks_two_distinct_images(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            self.assertEqual(kwargs['timeout'], 30)
            return subprocess.CompletedProcess(args, 0, '{"schemaVersion":2}', '')
        self.assertTrue(module.check(self.manifest, run))
        self.assertEqual(len(calls), 2)

    def test_denial_and_network_errors_fail_closed(self):
        for message in ('unauthorized', 'denied', 'network unavailable'):
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                return subprocess.CompletedProcess(args, 1, '', message)
            self.assertFalse(module.check(self.manifest, run))
            self.assertEqual(len(calls), 1)

    def test_timeout_fails(self):
        def run(args, **kwargs):
            raise subprocess.TimeoutExpired(args, 30)
        self.assertFalse(module.check(self.manifest, run))

    def test_malformed_success_fails(self):
        for value in ('', 'null', '[]', 'not-json'):
            self.assertFalse(module.check(self.manifest, lambda *a, **k: subprocess.CompletedProcess([], 0, value, '')))

    def test_local_api_rejected_before_docker(self):
        body = copy.deepcopy(self.manifest)
        body['services']['api'].update(image_kind='local_image_id', image='sha256:' + 'a' * 64)
        self.assertFalse(module.check(body, lambda *a, **k: self.fail('must not invoke docker')))
