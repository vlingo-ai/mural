import unittest

from scripts.ci_scope import select


class CIScopeTests(unittest.TestCase):
    def test_docs_do_not_start_builds(self):
        for stage in ("web", "ios", "android"):
            result = select(stage, ["apps/android/README.md", "apps/web/README.md", "docs/plan.md"])
            self.assertFalse(any(result.values()))

    def test_current_stage_defers_native_even_when_native_changes(self):
        result = select("web", ["apps/android/app/src/Test.kt", "apps/ios/Core/Test.swift"])
        self.assertFalse(any(result.values()))

    def test_web_only_change(self):
        self.assertEqual([k for k, v in select("web", ["apps/web/src/main.ts"]).items() if v], ["web"])

    def test_ios_stage(self):
        result = select("ios", ["apps/ios/Core/Test.swift", "apps/android/app/src/Test.kt"])
        self.assertTrue(result["swift"])
        self.assertFalse(result["android"])
        self.assertFalse(result["web"])

    def test_android_stage(self):
        result = select("android", ["apps/android/app/build.gradle.kts"])
        self.assertTrue(result["android"])
        self.assertTrue(result["android_release"])
        self.assertFalse(result["swift"])

    def test_shared_contract_checks_selected_client_and_server(self):
        for stage, key in (("web", "web"), ("ios", "swift"), ("android", "android")):
            result = select(stage, ["shared/fixtures/session.json"])
            self.assertTrue(result[key])
            self.assertTrue(result["server"])
            self.assertTrue(result["deployment"])

    def test_server_change_checks_active_client_compatibility(self):
        result = select("ios", ["services/api/src/routes.ts"])
        self.assertTrue(result["server"])
        self.assertTrue(result["swift"])
        self.assertFalse(result["android"])

    def test_release_docs_only_lightweight_android_validator_when_active(self):
        result = select("android", ["release/android/notes.md"])
        self.assertTrue(result["android_release"])
        self.assertFalse(result["android"])
        self.assertFalse(any(select("web", ["release/android/notes.md"]).values()))

    def test_policy_changes_run_selected_platform(self):
        result = select("web", [".github/ci-stage.json"])
        self.assertTrue(result["web"])
        self.assertTrue(result["server"])
        self.assertFalse(result["android"])

    def test_manual_all_covers_every_job(self):
        self.assertTrue(all(select("web", [], "all", True).values()))

    def test_manual_android_does_not_change_default(self):
        result = select("web", [], "android", True)
        self.assertTrue(result["android"])
        self.assertFalse(result["web"])
        self.assertFalse(select("web", [], force=True)["android"])

    def test_bad_platform_fails_closed(self):
        for stage, requested in (("unknown", "active"), ("web", "unknown")):
            with self.assertRaises(ValueError):
                select(stage, [], requested)


if __name__ == "__main__":
    unittest.main()
