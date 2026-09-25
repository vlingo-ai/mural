import copy
import json
import unittest
from scripts.generate_live_dtos import ROOT, render, ts_type


class LiveDTOTests(unittest.TestCase):
    def setUp(self):
        self.contract = json.loads((ROOT / 'shared/contracts/mural-api.openapi.json').read_text())

    def test_deterministic_and_language_shapes(self):
        result = render(self.contract)
        self.assertEqual(result, render(copy.deepcopy(self.contract)))
        self.assertIn('"transport"?: "webrtc" | "livekit-room"', result['live.d.ts'])
        self.assertIn('public let transport: String?', result['LiveDTOs.swift'])
        self.assertIn('val transport: String? = null', result['LiveDTOs.kt'])
        self.assertIn('val inputTokens: Long', result['LiveDTOs.kt'])

    def test_unsupported_field_fails(self):
        self.contract['components']['schemas']['LiveCapabilities']['properties']['transport'] = {'oneOf': []}
        with self.assertRaises(ValueError):
            render(self.contract)

    def test_nullable_is_not_optional(self):
        result = render(self.contract)['live.d.ts']
        self.assertIn('"providerCostNanoUSD": string | null', result)
        self.assertIn('"chargedNanoUSD"?: string | null', result)
        self.assertIn('"session": (LiveSessionStatusDTO) | (null)', result)
        self.assertIn('"transport": LiveTransportDTO', result)
        self.assertIn('export type LiveTransportDTO = (LiveWebRTCTransportDTO) | (LiveKitRoomTransportDTO)', result)

    def test_unknown_reference_and_shape_fail(self):
        for schema in ({'$ref': 'https://example.invalid/schema'}, {'$ref': '#/components/schemas/Unknown'},
                       {'type': 'object'}, {'oneOf': []}, {'allOf': []}):
            with self.assertRaises(ValueError):
                ts_type(schema)

    def test_native_discriminator_change_requires_review(self):
        self.contract['components']['schemas']['LiveTransport']['discriminator']['mapping']['new'] = '#/components/schemas/LiveKitRoomTransport'
        with self.assertRaises(ValueError):
            render(self.contract)
