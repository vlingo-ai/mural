import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('log_gate', Path(__file__).resolve().parents[2]
                                            / 'deploy/phase-5-5b/check-logs.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class LogGateTest(unittest.TestCase):
    def test_clean(self):
        self.assertIsNone(gate.check('fixture', lambda *a, **k: SimpleNamespace(
            returncode=0, stdout=b'normal', stderr=b'')))

    def test_command_failure_and_timeout_are_not_clean_logs(self):
        self.assertEqual(gate.check('fixture', lambda *a, **k: SimpleNamespace(
            returncode=1)), 'collection_failed')
        def fail(*args, **kwargs):
            raise TimeoutError('private details')
        self.assertEqual(gate.check('fixture', fail), 'collection_failed')

    def test_both_streams_scanned(self):
        for stream in ('stdout', 'stderr'):
            data = dict(returncode=0, stdout=b'', stderr=b'')
            data[stream] = b'Authorization: Bearer synthetic'
            self.assertEqual(gate.check('fixture', lambda *a, **k: SimpleNamespace(**data)),
                             'sensitive_pattern')
