import copy
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / 'deploy/phase-5-5b/check-manifest.py'
spec = importlib.util.spec_from_file_location('release_manifest', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.body = {'schema_version': 1, 'release_id': 'test-release', 'services': {
            name: {'source_commit': 'a' * 40, 'ci_run': 123, 'platform': 'linux/amd64',
                   'image_kind': 'registry_digest', 'image': 'ghcr.io/example/image@sha256:' + 'b' * 64}
            for name in module.SERVICES}}
        self.body['services']['database'].update(source_commit=None, ci_run=None)

    def test_registry_and_explicit_local(self):
        self.assertTrue(module.validate(self.body))
        self.body['services']['api'].update(image_kind='local_image_id', image='sha256:' + 'b' * 64)
        self.assertTrue(module.validate(self.body))

    def test_image_identity_is_not_a_tag(self):
        for image in ['latest', 'image:main', 'sha256:' + 'b' * 64]:
            self.body['services']['api']['image'] = image
            self.assertFalse(module.validate(self.body))

    def test_incomplete_or_unknown_fields(self):
        for key in list(self.body):
            item = copy.deepcopy(self.body)
            del item[key]
            self.assertFalse(module.validate(item))
        self.body['services']['api']['token'] = 'synthetic'
        self.assertFalse(module.validate(self.body))

    def test_invalid_identity(self):
        for key, value in [('source_commit', 'abc'), ('ci_run', True), ('platform', 'linux/arm64'),
                           ('image_kind', 'tag')]:
            item = copy.deepcopy(self.body)
            item['services']['api'][key] = value
            self.assertFalse(module.validate(item))

    def test_missing_service(self):
        del self.body['services']['edge']
        self.assertFalse(module.validate(self.body))
