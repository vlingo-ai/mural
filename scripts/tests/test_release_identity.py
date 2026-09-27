import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / 'deploy/phase-5-5b/check-release.py'
spec = importlib.util.spec_from_file_location('release_identity', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.ref = 'ghcr.io/example/api@sha256:' + 'a' * 64
        self.expected = {'image': self.ref, 'image_kind': 'registry_digest', 'platform': 'linux/amd64'}
        self.container = {'Config': {'Labels': {'com.docker.compose.service': 'api',
                           'com.docker.compose.project': 'test'}},
                          'Image': 'sha256:' + 'b' * 64, 'RestartCount': 0,
                          'State': {'Running': True, 'Status': 'running', 'Health': {'Status': 'healthy'}}}
        self.image = {'Id': self.container['Image'], 'Os': 'linux', 'Architecture': 'amd64', 'RepoDigests': [self.ref]}
        self.ids = [{'ID': 'container-id'}]

    def read(self, args):
        if args[0] == 'container':
            return self.ids
        return [self.container] if args[0] == 'inspect' else [self.image]

    def check(self):
        return module.verify_service('test', 'api', self.expected, self.read)

    def test_match(self):
        self.assertIsNone(self.check())

    def test_wrong_image(self):
        self.image['Id'] = 'sha256:' + 'c' * 64
        self.assertEqual(self.check(), 'image_mismatch')

    def test_wrong_project(self):
        self.container['Config']['Labels']['com.docker.compose.project'] = 'other'
        self.assertEqual(self.check(), 'project_mismatch')

    def test_missing_or_multiple(self):
        for ids in [[], self.ids * 2]:
            self.ids = ids
            self.assertEqual(self.check(), 'container_count')

    def test_registry_provenance(self):
        self.image['RepoDigests'] = []
        self.assertEqual(self.check(), 'registry_digest_missing')

    def test_local_id(self):
        self.expected.update(image_kind='local_image_id', image=self.image['Id'])
        self.assertIsNone(self.check())
        self.expected['image'] = 'sha256:' + 'c' * 64
        self.assertEqual(self.check(), 'local_id_mismatch')

    def test_platform(self):
        self.image['Architecture'] = 'arm64'
        self.assertEqual(self.check(), 'platform_mismatch')

    def test_health_still_required(self):
        self.container['State']['Health']['Status'] = 'unhealthy'
        self.assertEqual(self.check(), 'not_healthy')
