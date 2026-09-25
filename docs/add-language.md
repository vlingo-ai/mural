# How to add a language module

Use this guide with the existing Swift package and Xcode project. [The architecture explanation](language-architecture.md) describes progress isolation and storage decisions.

The [current baseline](web-ios-model-gateway-plan.md) pauses Mandarin development/testing and
keeps Cantonese coming later. These are future implementation instructions, not authorization
to enable a language or run a paid quality check now. Display Cantonese as “粤语”, preserving its locale.

1. Add a file in `apps/ios/Core/Languages/`, following `Spanish.swift` or `Norwegian.swift`. Define a `LanguageModule` with a unique, stable language ID, display names, locale, greeting, speech and writing guidance, lemma rules, six teaching stages and a topic placeholder. Include `lookupUnavailableReply`, the spoken fallback when a web lookup is unavailable, in the target language. Include valid regional alternatives in the correction guidance.
2. Override culture-specific themes by their existing IDs. Keep shared IDs stable. New common themes belong in `apps/ios/Core/Themes.swift`.
3. Register the module in the known-language registry first. This enables archive decoding, shared teaching policy, evidence validation and progress projection without exposing an unfinished language. Add it to the available-language registry only after its product and human-quality gates pass. Keep published IDs stable and retain modules needed to open existing learning records. Run `python3 scripts/export_android_content.py` so the Android client picks up both the known modules and availability policy.
4. Add language fixtures in `apps/ios/Tests/LanguageTests.swift`. Check supported versus independent recall, evidence from another language, archive round trips, vocabulary isolation and prompt contamination. Add a UI check for selecting the language and returning to an existing one.
5. Run `swift test --package-path apps/ios` from the repository root, then build and run the native UI tests described in the [build guide](build-and-test.md). Core Swift files are discovered by Swift Package Manager. If you add app files, also run `python3 scripts/generate_project.py`.
6. Validate a short live conversation on an iPhone with its saved API key: greeting, input in a support language, target-language output, corrections, subtitles, a cultural theme and a sourced topic. Confirm progress remains separate after switching and relaunching. Review pronunciation and correction quality with a competent speaker.

For Hong Kong Cantonese, use the stable ID `yue`, locale `yue-Hant-HK` and Hong Kong Traditional Chinese. Keep it distinct from Mandarin `zh`; do not reuse pinyin as Cantonese pronunciation annotation. Test colloquial Cantonese, written forms, Jyutping if present, English code-switching and accidental switching to Mandarin with competent Hong Kong Cantonese reviewers before adding it to the available-language registry.

For an explicitly authorized audio check in a Debug build, launch with `--verify-audio --verify-language=<registered ID>`. It makes two real API connections, uses temporary learning data, and writes non-content diagnostics to `Documents/audio-verification.json` in the app container. It is excluded from Release builds and ordinary tests. Network and provider failures still need investigation; a successful connection alone does not establish teaching quality.
