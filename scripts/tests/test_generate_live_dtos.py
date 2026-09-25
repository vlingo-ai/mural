import copy
import json
import unittest
from scripts.generate_live_dtos import ROOT, render


class LiveDTOTests(unittest.TestCase):
    def setUp(self):
        self.contract = json.loads((ROOT / 'shared/contracts/mural-api.openapi.json').read_text())

    def test_deterministic_and_language_shapes(self):
        result = render(self.contract)
        self.assertEqual(result, render(copy.deepcopy(self.contract)))
        self.assertIn('transport?: "webrtc" | "livekit-room"', result['live.ts'])
        self.assertIn('public let transport: String?', result['LiveDTOs.swift'])
        self.assertIn('val transport: String? = null', result['LiveDTOs.kt'])
        self.assertIn('val inputTokens: Long', result['LiveDTOs.kt'])

    def test_unsupported_field_fails(self):
        self.contract['components']['schemas']['LiveCapabilities']['properties']['transport'] = {'oneOf': []}
        with self.assertRaises(ValueError):
            render(self.contract)
