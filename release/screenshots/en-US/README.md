# App Store screenshots — English interface

<!-- baseline-scope:2026-09-23 -->
> 历史/upstream 原生发布参考：以下清单、定价草稿、身份、域名和已完成状态只适用于其注明的版本，不是 vLingo 当前发布批准。新三端版本须重新审查隐私、数据流、签名、商店材料及实测结果。
> 当前范围和后续顺序见[项目开发基准](../../../docs/web-ios-model-gateway-plan.md)。

Captured from the current native app on an **iPhone 17 Pro Max simulator**, iOS 26.4, on 12 September 2026. All four upload files are **1320 × 2868**, portrait PNGs with no alpha channel. Status bars show 09:41, full signal and a full black battery. No device frame, resize or visual retouching was applied.

| File | Screen |
| --- | --- |
| `01-greeting.png` | Spanish greeting with optional English meaning |
| `02-conversation.png` | Sample Spanish café conversation and English subtitle |
| `03-themes.png` | The Spanish module’s themes in the English interface |
| `04-words.png` | Sample Spanish vocabulary with three recall strengths |

The dialogue and vocabulary are synthetic data from the simulator-only `ScreenshotPreview`. They do not contain personal conversations and do not represent a learner’s measured progress. The preview does not make API calls.

`originals/` retains the untouched simulator captures. Simulator PNGs include an opaque alpha channel; `release/prepare-screenshots.swift` removes that channel for App Store upload and verifies identical decoded pixels. The four PNGs beside this README are the upload set.

To reproduce, build the Debug simulator app and launch with `--preview --screenshot=greeting`, `conversation`, `themes` or `words`. Capture using `simctl io … screenshot`, then run the native export script with the original and output directories. Keep the original captures separate from the export destination.
