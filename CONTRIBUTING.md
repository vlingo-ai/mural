# Contributing to Mural

Follow the [accepted project baseline](docs/web-ios-model-gateway-plan.md) and
[documentation index](docs/documentation-index.md). Preserve existing native archives; current
Web history is server-authoritative. Do not promise device-only storage for the hosted product.
Teaching claims must remain no stronger than their evidence.

The [release verification plan](docs/operations/release-verification-plan.md) is one of the project's
highest-priority mandatory living documents. Every development iteration must update its iteration
register after testing/verification and before completion, linking dated sanitized evidence and
recording results, limitations, reusable lessons and automation changes. Include failures and blocked
checks. If no reusable rule changes, explicitly record that review outcome. Keep detailed reports in
`verification/`, promote reusable findings into the plan, and reference both in the PR/handover.
Documentation completion does not authorize paid testing or deployment.

For session work, cover API/Worker/client compatibility and all relevant protocol fixtures;
Web tests do not establish iOS/Android readiness. Distinguish implemented, locally tested, deployed
and live-accepted behavior. Required server changes ship with authorized app releases under AGENTS.md.
Update scope/runbook docs when behavior changes; keep dated evidence and licenses, archive superseded
plans instead of maintaining competing active roadmaps. Do not enable paused languages or providers
through a documentation-only change.

For a bug, describe the expected result, what happened, and how to reproduce it. Include the app version, iOS or Android version, learning language and audio route when relevant. Remove personal conversation content from logs and screenshots. Never post an API key, authentication token or learning export in an issue.

Before a substantial feature, open an issue describing the problem and proposed behavior. Small fixes can go straight to a pull request.

1. Follow the [iPhone](docs/run-on-iphone.md) or [Android](docs/run-on-android.md) setup guide, or use a simulator.
2. Make a focused change. Use [the language-module guide](docs/add-language.md) for new languages.
3. Run `swift test --package-path apps/ios` and the relevant native checks in [the build guide](docs/build-and-test.md). Changes to voice behavior need a real-device check; report when that check was unavailable.
4. If your change touches `apps/ios/Core/`, make the matching change under `apps/android/app/src/main/java/chat/mural/core/` and run `python3 scripts/check_cross_platform.py`. State in your pull request if you could not build or run the Android app to verify it.
5. Describe the user-visible change, how you verified it, and any remaining limitations in your pull request.

Keep credentials and machine-specific signing settings out of commits. Update the project generator when adding app resources or project settings. Preserve third-party notices when modifying dependencies.

Report security vulnerabilities through the [private process](SECURITY.md). By contributing code you have the right to share, you agree to make it available under the project’s [MIT License](LICENSE).
