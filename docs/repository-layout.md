# Repository layout

This fork keeps Web, iOS, Android and Mural API in one repository; each has its own build and release process.
The [development baseline](web-ios-model-gateway-plan.md) governs their evolution.
The upstream marketing website remains a separate author's project, not this fork's Web application.

| Location | Responsibility |
| --- | --- |
| `apps/web/` | React browser client; current English-only LiveKit staging reference |
| `apps/ios/` | Xcode project, SwiftUI app, Swift package, signing configuration and iPhone tests |
| `apps/android/` | Gradle project, Compose app, Android resources and Android tests |
| `services/api/` | Account verification, minute ledger, operator tools, PostgreSQL migrations and server deployment |
| `shared/contracts/` | Public request and response formats |
| `shared/fixtures/` | Learning archives and expected outcomes checked by both native clients |
| `scripts/` | Content generation, project generation and compatibility checks |
| `release/` | Store submission material and release requirements |
| `deploy/phase-5-5b/` | Current staging deployment runbook and bundle |
| `verification/phase-5-5b/` | Dated staging evidence, not prospective design |
| `docs/archive/` | Superseded plans; never an active deployment runbook |

Model Gateway and its isolated `workers/livekit-gpt-live/` project live in the separate
`vlingo-ai/model-gateway` repository. Worker/plugin dependencies are not merged into the Gateway process.

## Local worktree convention (2026-09-25)

User-approved layout for both repositories:

```text
/Volumes/Kingston/MyProj/vlingo-ai/
  mural/                         # primary clone; intended main checkout
  mural-<task>/                  # branch codex/<task>
/Volumes/Kingston/DeepTutor/
  model-gateway/                 # main; includes workers/livekit-gpt-live/
  model-gateway-<task>/           # branch codex/<task>; Gateway and/or Worker work
```

Worker is part of the Gateway repository, not a third clone. Each task worktree contains
the repository; Worker commands run in its Worker subdirectory. Retain the existing two
project roots. A primary clone is not inherently on main: verify before switching.
Mural's primary clone currently remains on an older feature branch.

Use one named task per worktree. OS temporary directories are for reproducible test artifacts,
not ongoing development or the only copy of unpublished changes. Before migration, check the
common Git directory, branch, dirty/untracked files and destination; save a checkpoint, use
`git worktree move`, then verify content and registration. Before cleanup, audit unique commits,
unpublished files, ignored private data and retained evidence. Clean status or prunable registration
alone does not authorize deletion. Existing temporary/Codex-managed worktrees need a separate audit.

Run repository scripts from the root. Run Gradle from `apps/android/` and server commands from `services/api/`. Swift commands use `--package-path apps/ios`. Open `apps/ios/Mural.xcodeproj` in Xcode. The [build guide](build-and-test.md) gives the commands.

Language definitions currently originate in `apps/ios/Core/Languages/`. The exporter generates Android's language content from those definitions. Teaching logic runs natively in Swift and Kotlin; the compatibility checker and shared fixtures detect differences in prompts, thresholds and archive fields. They do not prove equivalent speech quality or native behavior. A future web client should consume a versioned language-content package rather than parse either app's source at runtime.

Keep platform audio, permissions and secure storage in platform adapters. API owns accounts, funding and product sessions.
Web already uses server-authoritative history with a disposable cache; existing native archives remain local until an explicit migration.
The target is reliable Worker-to-API final history and cross-client retrieval, not silent upload of old archives.
A balance response never authorizes client-reported billable usage.

Folder moves do not change bundle IDs, Android application IDs, signing keys or stored data formats. Existing installations must keep their signing identities when updated. CI builds test and debug artifacts without production keys; signed store bundles require the separate release process. [Contribution guidance](../CONTRIBUTING.md) describes checks to run before submitting a change.
