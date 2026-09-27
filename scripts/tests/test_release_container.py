import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'deploy/phase-5-5b/check-container.py'
spec = importlib.util.spec_from_file_location('release_container', SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ContainerGateTests(unittest.TestCase):
    def setUp(self):
        self.record = {'Config': {'Labels': {'com.docker.compose.service': 'api'}},
                       'State': {'Status': 'running', 'Running': True,
                                 'Health': {'Status': 'healthy'}}, 'RestartCount': 0}

    def test_healthy(self):
        self.assertIsNone(checker.evaluate('api', [self.record]))

    def test_required_health(self):
        for status in ['unhealthy', 'starting', None]:
            with self.subTest(status=status):
                self.record['State']['Health'] = {'Status': status}
                self.assertIsNotNone(checker.evaluate('api', [self.record]))
        del self.record['State']['Health']
        self.assertEqual(checker.evaluate('api', [self.record]), 'health_missing')

    def test_stopped_and_abnormal(self):
        for key, value in [('Status', 'exited'), ('Running', False), ('Paused', True),
                           ('OOMKilled', True), ('Restarting', True)]:
            with self.subTest(key=key):
                item = copy.deepcopy(self.record)
                item['State'][key] = value
                self.assertIsNotNone(checker.evaluate('api', [item]))

    def test_restarts(self):
        for value in [1, -1, None, '0', False]:
            self.record['RestartCount'] = value
            self.assertIsNotNone(checker.evaluate('api', [self.record]))

    def test_worker_without_health_is_not_registration_proof(self):
        self.record['Config']['Labels']['com.docker.compose.service'] = 'agent-worker'
        del self.record['State']['Health']
        self.assertIsNone(checker.evaluate('agent-worker', [self.record]))

    def test_invalid_and_wrong_target(self):
        for records in [None, {}, [], [self.record, self.record], [{}], [None]]:
            self.assertIsNotNone(checker.evaluate('api', records))
        self.assertIsNotNone(checker.evaluate('edge', [self.record]))

    def test_cli_fails_closed_without_leaking_input(self):
        secret = 'synthetic-private-value'
        for payload in [secret, json.dumps({'private': secret})]:
            result = subprocess.run([sys.executable, str(SCRIPT), 'api'], input=payload,
                                    text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(secret, result.stdout + result.stderr)

    def test_cli_success(self):
        result = subprocess.run([sys.executable, str(SCRIPT), 'api'],
                                input=json.dumps([self.record]), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
