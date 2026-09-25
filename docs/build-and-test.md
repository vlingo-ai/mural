# How to build and test Mural

For reusable release gates, evidence collection, fault-injection coverage and automation implementation
priorities, see the [release verification plan](operations/release-verification-plan.md) and
[report template](../verification/release-verification-template.md). Planned checks are not implemented
merely because they appear in that plan.

<!-- baseline-scope:2026-09-23 -->
> 适用范围：以下原生构建、安装或运营操作按对应实现保留；不自动启用托管语音、语言、支付或付费测试。iOS/Android 当前仍为旧 WebRTC，LiveKit 三端迁移按最新基准另行测试；upstream 身份不能当作本 fork 配置。
> 当前范围和后续顺序见[项目开发基准](web-ios-model-gateway-plan.md)。

Run commands from the repository root unless a step changes directory. The iPhone project and Swift package live in `apps/ios/`. Core tests need Swift 6. Native builds need Xcode 26 or later.

## Run offline checks

### CI stage selection (2026-09-25)

[`.github/ci-stage.json`](../.github/ci-stage.json) is the reviewed CI stage switch:
Phase 5.5 (including B1–B7 and 5.5C) uses `platform: web`; Phase 6 switches to
`platform: ios`; the later Android stage switches to `platform: android`.
Change both `phase` and `platform` in the stage-transition PR. No automatic calendar switch.

Automatic PR/main checks select the active client's jobs from changed executable/build inputs.
Markdown-only changes skip client builds. API/shared changes also select the active client for
compatibility and run server/deployment checks. Security and inexpensive shared contract checks
remain common to every stage; these static checks do not build or launch either native app.
Inactive native builds, release validation and emulator suites are deferred, even if their paths
change; a skipped check means NOT_APPLICABLE, never native release acceptance.

Checks and Android workflows expose `workflow_dispatch` with a platform override. For complete
all-platform validation run **both** workflows with `platform: all`; the Android workflow owns
its build/emulator jobs. A manual run forces all checks for the selected platform, independent of
the last diff, and does not change the default stage. Before a native release run that platform's
full suite plus the existing simulator/device acceptance; `swift-core` alone is not iOS app QA.

`checks-gate` and `android-gate` always evaluate selection and actual job results; failed selection,
failed/cancelled required jobs, and unexpected skips fail the gate. If branch protection is enabled,
require these stable aggregate gates along with Contracts/Secrets rather than filtered workflows.
Do not use `[skip ci]`. Gate configuration is versioned and reviewed like source code.

```sh
swift test --package-path apps/ios
xcodebuild -project apps/ios/Mural.xcodeproj -scheme Mural \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .build/DerivedData \
  CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

Create an iPhone 17 simulator in Xcode’s **Devices and Simulators** window. If you name it `iPhone 17`, run UI tests with:

```sh
xcodebuild -project apps/ios/Mural.xcodeproj -scheme Mural \
  -destination 'platform=iOS Simulator,name=iPhone 17,arch=arm64' \
  -derivedDataPath .build/DerivedData \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  -parallel-testing-enabled NO test
```

Leave local signing enabled for UI tests so Xcode installs a normal **Sign to Run
Locally** build. The first launch after installing Xcode, a simulator runtime, or a
large binary dependency can spend extra time in macOS security scanning; wait for
that launch to finish before diagnosing an otherwise blank simulator screen.

The core suite covers evidence validation, transcript revisions, language isolation, recall spacing, archive validation, translation cancellation, and managed-account configuration and security parsing. Native UI tests exercise the screens with in-memory data. Neither suite needs an API key. Configured provider sign-in and account deletion need the separate device checks in [managed accounts](managed-accounts.md).

## Check the Android port and the cross-platform contracts

```sh
(cd apps/android && ./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug)
```

From the repository root, run the same checks CI runs on every pull request:

```sh
python3 -m unittest discover -s scripts/tests -t .
python3 scripts/export_android_content.py --check
python3 scripts/check_cross_platform.py
```

The last two catch generated language content and a Swift core change without its Kotlin counterpart, respectively. See [how Mural keeps languages independent](language-architecture.md) for what each contract covers.

## Preview without saving learning data

In **Product → Scheme → Edit Scheme → Run → Arguments**, add `--preview`. The app opens with temporary storage and skips onboarding. In a Debug build, add `--ended-conversation` to exercise the ended-conversation state. Preview fixtures make no API calls.

Remove preview arguments before testing normal persistence. For actual speech, [install on an iPhone](run-on-iphone.md) and use the key saved through Settings.

## Update the generated project

After adding or removing files under `apps/ios/App/`, run:

```sh
python3 scripts/generate_project.py
```

The generator moves a team selected in Xcode into the ignored `apps/ios/Config/Local.xcconfig`. The public `apps/ios/Config/Signing.xcconfig` includes that file when present. You can also copy `apps/ios/Config/Local.example.xcconfig` to `apps/ios/Config/Local.xcconfig` and enter your team ID there. Keep repeatable project settings in the generator; other manual project edits can be replaced on the next run. Swift Package Manager discovers files under `apps/ios/Core/` automatically.

## Verify live changes

After changing audio, prompts or a language module, check a short conversation on a real iPhone: greeting, learner reply, correction, subtitles, interruption, mute and final closure. Check speaker and headphones separately. Try cellular with the Mac disconnected.

Debug-only `--verify-audio --verify-language=<language ID>` starts two real voice sessions using the phone’s saved key. `--verify-meaning` adds the translation/reset check. These flags incur API usage, use temporary learning data, and write content-free diagnostics in the app container. Run them only when live testing is intended; they are excluded from Release builds.

For German, Italian, Brazilian Portuguese or Mandarin, `--verify-audio --verify-language-flow --verify-language=<de|it|pt|zh>` runs one live session with a support-language beginner request and a more complex target-language typed reply. It checks received audio, detected target language, meanings, word lookup, supported evidence, archive decoding and switching away and back. The microphone is muted once connected. The report is `Documents/language-verification-<ID>.json`; it contains no transcript, audio or credentials. These synthetic typed turns do not verify recognition of human speech or the quality of corrections and pronunciation. Reopen the app without verification flags to return to its persistent learning record.

Record the build, checks and remaining limitations in `verification/validation.md`. Successful API transport does not establish pronunciation quality or teaching effectiveness.

## Record a scripted Spanish demo

In a Debug build, launch with `--verify-audio --record-spanish-demo`. This uses the saved API key and temporary learning data. After a 30-second setup pause, it starts a café conversation with English meanings, mutes the microphone, and sends two scripted typed replies. Mural’s responses and speech come from the live APIs. The second reply contains a grammar mistake so the conversation can demonstrate a correction.

This is a typed-input demo with live voice output. It does not verify speech recognition or a human conversation. The helper ends the session and writes a content-free `demo-verification.json` status in the app container. Actual recording is separate; select the Mural screen and its app audio in your recorder. The helper has been compiled on-device; a completed recording and playback review remain required.
