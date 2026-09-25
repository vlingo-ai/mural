# 文档索引与清理记录 — 2026-09-23

唯一活动总计划：[项目开发基准](web-ios-model-gateway-plan.md)。两份 9 月 23 日架构审查已采纳，但实现仍待完成。

## 阅读顺序与适用范围

1. 总计划：范围、顺序、任务及完成条件。
2. reviews/ 的架构与三端/多供应商设计：解释已采纳方案；示例字段不是现行 API。
3. apps/web、apps/ios、apps/android 的 README：各端当前实现和迁移入口。
4. deploy/phase-5-5b/README.md：受控发布步骤；verification/phase-5-5b/README.md：实际证据及未过门槛。
5. 旧原生/BYOK、支付、商店、截图及历史验证：保留适用版本说明，不能覆盖新基准。
6. [发布上线测试与验证方案](operations/release-verification-plan.md)：用户指定的最高优先级必维护文档之一，每轮测试验证后必须归集并提炼规则；与[报告模板](../verification/release-verification-template.md)配合，区分已有自动化与待实现设计，不替代实际执行证据。此处排序不是优先级排序。

## 清理决定

- 849 行旧总计划移入 docs/archive/2026-09-23-superseded-development-plan.md；旧入口替换为已采纳基准，归档相对链接随位置修正。没有丢弃历史开发/部署证据。
- 原生直连与本地 archive 是仍存实现，不因目标统一而删除其指南；补上适用范围。
- 原作者 OAuth 示例从活动配置步骤改为自有客户端占位符；保留历史记录中的公开身份，不将其归给本项目。
- Gateway Live 残留 schema、OpenAPI 漂移属于待测试代码修复，不在文档清理中删契约文件。
- 许可、第三方 notices、语言资源、历史证据、回滚/备份材料未删除；商店 .txt 文案保留，但受 release 目录的历史范围约束，不能直接发布。
- 没有发现需要不可恢复删除的独立废弃文档；废弃计划退出活动入口并归档。原生商店记录不移位，避免破坏证据/脚本引用。

## 逐文件覆盖

范围是版本控制文档及本轮新增文档，不包含 node_modules、构建缓存、密钥、用户学习记录或第三方安装目录。
以下 111 个 Markdown/text 文档或资源均已分类（包括后续资源清理、9 月 24 日 Gate 7 续办记录、可复用发布验证方案/模板及 B1/B2 候选证据）；该索引本身另计。历史正文保持原结论，只增加范围提示。

| 文件 | 处理 |
| --- | --- |
| [verification/2026-09-25-documentation-alignment.md](../verification/2026-09-25-documentation-alignment.md) | 新增：文档基准候选检查与私有清单边界 |
| [verification/2026-09-25-b2-control-receipts.md](../verification/2026-09-25-b2-control-receipts.md) | 新增：B2 分次本地、跨仓与 CI 候选证据；未合并或部署 |
| [verification/2026-09-24-b1-resource-cleanup.md](../verification/2026-09-24-b1-resource-cleanup.md) | 新增：B1 本地实现、非计费测试、2026-09-25 staging 部署与保留限制 |
| [.github/pull_request_template.md](../.github/pull_request_template.md) | 更新：现行入口/范围/兼容约束 |
| [AGENTS.md](../AGENTS.md) | 保留发布安全指引；追加每轮测试验证后强制维护发布验证方案的规则 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 更新：现行入口/范围/兼容约束 |
| [README.md](../README.md) | 更新：现行入口/范围/兼容约束 |
| [SECURITY.md](../SECURITY.md) | 更新：现行入口/范围/兼容约束 |
| [apps/android/README.md](../apps/android/README.md) | 更新：现行入口/范围/兼容约束 |
| [apps/android/app/src/main/assets/Apache-2.0.txt](../apps/android/app/src/main/assets/Apache-2.0.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/assets/Mural-LICENSE.txt](../apps/android/app/src/main/assets/Mural-LICENSE.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/assets/Nunito-OFL.txt](../apps/android/app/src/main/assets/Nunito-OFL.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/assets/THIRD-PARTY-NOTICES.txt](../apps/android/app/src/main/assets/THIRD-PARTY-NOTICES.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/assets/WebRTC-SDK-LICENSE.txt](../apps/android/app/src/main/assets/WebRTC-SDK-LICENSE.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/assets/WebRTC-THIRD-PARTY-NOTICES.md](../apps/android/app/src/main/assets/WebRTC-THIRD-PARTY-NOTICES.md) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/resources/mandarin/LICENSE.txt](../apps/android/app/src/main/resources/mandarin/LICENSE.txt) | 保留：许可/第三方归属，不删改 |
| [apps/android/app/src/main/resources/mandarin/phrases.txt](../apps/android/app/src/main/resources/mandarin/phrases.txt) | 保留：语言资源或打包输入，非活动计划 |
| [apps/ios/App/ThirdPartyNotices.txt](../apps/ios/App/ThirdPartyNotices.txt) | 保留：许可/第三方归属，不删改 |
| [apps/ios/README.md](../apps/ios/README.md) | 更新：现行入口/范围/兼容约束 |
| [apps/web/README.md](../apps/web/README.md) | 更新：现行入口/范围/兼容约束 |
| [deploy/phase-5-5b/README.md](../deploy/phase-5-5b/README.md) | 更新：现行入口/范围/兼容约束 |
| [docs/add-language.md](add-language.md) | 更新：现行入口/范围/兼容约束 |
| [docs/adr/0001-livekit-gpt-live-spike.md](adr/0001-livekit-gpt-live-spike.md) | 更新：现行入口/范围/兼容约束 |
| [docs/android-accounts.md](android-accounts.md) | 更新：现行入口/范围/兼容约束 |
| [docs/android/ai-value-commerce.md](android/ai-value-commerce.md) | 更新：现行入口/范围/兼容约束 |
| [docs/android/design.md](android/design.md) | 更新：现行入口/范围/兼容约束 |
| [docs/android/guest-onboarding.md](android/guest-onboarding.md) | 更新：现行入口/范围/兼容约束 |
| [docs/android/minute-purchases.md](android/minute-purchases.md) | 更新：现行入口/范围/兼容约束 |
| [docs/archive/2026-09-23-superseded-development-plan.md](archive/2026-09-23-superseded-development-plan.md) | 归档：旧总计划失效，保留历史证据 |
| [docs/build-and-test.md](build-and-test.md) | 更新：现行入口/范围/兼容约束 |
| [docs/conversation-minutes.md](conversation-minutes.md) | 更新：现行入口/范围/兼容约束 |
| [docs/language-architecture.md](language-architecture.md) | 更新：现行入口/范围/兼容约束 |
| [docs/manage-free-minutes.md](manage-free-minutes.md) | 更新：现行入口/范围/兼容约束 |
| [docs/managed-accounts.md](managed-accounts.md) | 更新：现行入口/范围/兼容约束 |
| [docs/operations/2026-09-23-phase-5-5b-cleanup.md](operations/2026-09-23-phase-5-5b-cleanup.md) | 资源清理清单、恢复依据及 VPS sudo 待办 |
| [docs/operations/release-verification-plan.md](operations/release-verification-plan.md) | 最高优先级必维护文档之一：发布验证复盘、自动化设计与逐轮归集；未宣称待实现能力已上线 |
| [docs/repository-layout.md](repository-layout.md) | 更新：现行入口/范围/兼容约束 |
| [docs/reviews/2026-09-23-cross-client-multi-provider-design.md](reviews/2026-09-23-cross-client-multi-provider-design.md) | 采纳：详细设计，未宣称已实施 |
| [docs/reviews/2026-09-23-phase-5-5b-architecture-review.md](reviews/2026-09-23-phase-5-5b-architecture-review.md) | 采纳：详细设计，未宣称已实施 |
| [docs/run-on-android.md](run-on-android.md) | 更新：现行入口/范围/兼容约束 |
| [docs/run-on-iphone.md](run-on-iphone.md) | 更新：现行入口/范围/兼容约束 |
| [docs/web-ios-model-gateway-plan.md](web-ios-model-gateway-plan.md) | 更新：现行入口/范围/兼容约束 |
| [marketing/screenshots/iphone-17-spanish/README.md](../marketing/screenshots/iphone-17-spanish/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [marketing/screenshots/language-support/README.md](../marketing/screenshots/language-support/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/README.md](../release/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/README.md](../release/android/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/assets/README.md](../release/android/assets/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/build-and-verify.md](../release/android/build-and-verify.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/candidate-audit-2026-09-13.md](../release/android/candidate-audit-2026-09-13.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/candidate-audit-8768c86-2026-09-13.md](../release/android/candidate-audit-8768c86-2026-09-13.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/candidate-scopes.md](../release/android/candidate-scopes.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/declarations.md](../release/android/declarations.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/direct-v6-preparation.md](../release/android/direct-v6-preparation.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/metadata/en-US/full-description.txt](../release/android/metadata/en-US/full-description.txt) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/metadata/en-US/release-notes.txt](../release/android/metadata/en-US/release-notes.txt) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/metadata/en-US/short-description.txt](../release/android/metadata/en-US/short-description.txt) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/metadata/en-US/title.txt](../release/android/metadata/en-US/title.txt) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/notes-v8.md](../release/android/notes-v8.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/paid-listing-copy.md](../release/android/paid-listing-copy.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/preview-readiness-2026-09-13.md](../release/android/preview-readiness-2026-09-13.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/release-gates.md](../release/android/release-gates.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/signed-candidate-2026-09-14-v2.md](../release/android/signed-candidate-2026-09-14-v2.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/signed-candidate-2026-09-14-v3.md](../release/android/signed-candidate-2026-09-14-v3.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/signed-candidate-2026-09-14-v4.md](../release/android/signed-candidate-2026-09-14-v4.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/android/signed-candidate-2026-09-14.md](../release/android/signed-candidate-2026-09-14.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/app-privacy.md](../release/app-privacy.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/app-store-metadata.md](../release/app-store-metadata.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/apple-release.md](../release/apple-release.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/screenshots/en-US/README.md](../release/screenshots/en-US/README.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/security-audit-2026-09-12.md](../release/security-audit-2026-09-12.md) | 历史/发布参考：禁止直接当新版本材料 |
| [release/source-audit.md](../release/source-audit.md) | 历史/发布参考：禁止直接当新版本材料 |
| [services/api/README.md](../services/api/README.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/contracts/README.md](../services/api/contracts/README.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/access-requests.md](../services/api/docs/access-requests.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/account-closeout-support.md](../services/api/docs/account-closeout-support.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/accounts-reference.md](../services/api/docs/accounts-reference.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/actual-cost-pricing.md](../services/api/docs/actual-cost-pricing.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/ai-reporting.md](../services/api/docs/ai-reporting.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/enable-accounts.md](../services/api/docs/enable-accounts.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/enable-minute-commerce.md](../services/api/docs/enable-minute-commerce.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/hosted-helpers.md](../services/api/docs/hosted-helpers.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/hosted-startup-recovery.md](../services/api/docs/hosted-startup-recovery.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/minute-commerce-configuration.md](../services/api/docs/minute-commerce-configuration.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/minute-provider-integration.md](../services/api/docs/minute-provider-integration.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/minute-purchases.md](../services/api/docs/minute-purchases.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/play-purchase-recovery.md](../services/api/docs/play-purchase-recovery.md) | 更新：现行入口/范围/兼容约束 |
| [services/api/docs/stripe-managed-payments.md](../services/api/docs/stripe-managed-payments.md) | 更新：现行入口/范围/兼容约束 |
| [shared/contracts/README.md](../shared/contracts/README.md) | 更新：现行入口/范围/兼容约束 |
| [verification/android-codeql-review-2026-09-14.md](../verification/android-codeql-review-2026-09-14.md) | 历史证据保留；索引统一当前状态 |
| [verification/release-verification-template.md](../verification/release-verification-template.md) | 新增：发布证据、例外、费用及最终签结可复用模板 |
| [verification/android-codeql-review.md](../verification/android-codeql-review.md) | 历史证据保留；索引统一当前状态 |
| [verification/android-commerce-and-voice.md](../verification/android-commerce-and-voice.md) | 历史证据保留；索引统一当前状态 |
| [verification/android-design/README.md](../verification/android-design/README.md) | 历史证据保留；索引统一当前状态 |
| [verification/android-hosted-conversation-integration.md](../verification/android-hosted-conversation-integration.md) | 历史证据保留；索引统一当前状态 |
| [verification/android-release-progress.md](../verification/android-release-progress.md) | 历史证据保留；索引统一当前状态 |
| [verification/android-validation.md](../verification/android-validation.md) | 历史证据保留；索引统一当前状态 |
| [verification/conversation-quality-pr128-review-2026-09-17.md](../verification/conversation-quality-pr128-review-2026-09-17.md) | 历史证据保留；索引统一当前状态 |
| [verification/conversation-reliability/README.md](../verification/conversation-reliability/README.md) | 历史证据保留；索引统一当前状态 |
| [verification/conversation-reliability/validation.md](../verification/conversation-reliability/validation.md) | 历史证据保留；索引统一当前状态 |
| [verification/hosted-startup-recovery-2026-09-14.md](../verification/hosted-startup-recovery-2026-09-14.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-21-gate-1-livekit.md](../verification/phase-5-5b/2026-09-21-gate-1-livekit.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-21-gate-4-google-oauth.md](../verification/phase-5-5b/2026-09-21-gate-4-google-oauth.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-22-gate-6-non-billable.md](../verification/phase-5-5b/2026-09-22-gate-6-non-billable.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-22-gate-7-bounded-acceptance.md](../verification/phase-5-5b/2026-09-22-gate-7-bounded-acceptance.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-23-english-energy-gates-rollout.md](../verification/phase-5-5b/2026-09-23-english-energy-gates-rollout.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-23-english-only-web-rollout.md](../verification/phase-5-5b/2026-09-23-english-only-web-rollout.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-23-english-timing-diagnostic.md](../verification/phase-5-5b/2026-09-23-english-timing-diagnostic.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-23-english-timing-rollout.md](../verification/phase-5-5b/2026-09-23-english-timing-rollout.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-23-reconnect-incident.md](../verification/phase-5-5b/2026-09-23-reconnect-incident.md) | 历史证据保留；索引统一当前状态 |
| [verification/phase-5-5b/2026-09-24-gate-7-continuation.md](../verification/phase-5-5b/2026-09-24-gate-7-continuation.md) | 当前续办：计时、资源、结算与条件豁免；附非计费采样/汇总脚本入口 |
| [verification/phase-5-5b/README.md](../verification/phase-5-5b/README.md) | 历史证据保留；索引统一当前状态 |
| [verification/validation.md](../verification/validation.md) | 历史证据保留；索引统一当前状态 |

## 项目目录及跨仓库

| 目录/文档 | 处理 |
| --- | --- |
| 项目级开发基准（仓库外入口） | 指向本仓库的唯一阶段基准；本仓库不保存操作者本机绝对路径 |
| Mural 旧工作副本 | 旧源码快照保留，未切换分支或覆盖代码；需在本方案合并后显式更新 |
| Gateway 旧工作副本 | DeepTutor/ASR 范围索引及 README、契约文档适用性需与本基准同步 |
| Worker 参考工作副本 | 跨仓库边界、可靠性交付待办及 README 需与本基准同步 |
| 两个 Gateway 的 docs/audio-protocol-v1.md、audio-stream-protocol-v1.md、browser-recording-compatibility.md | 保留：独立 DeepTutor 音频协议，不改为实时 LiveKit 代理，也不在 Linux staging 启用 |

Gateway 中的新 docs/vlingo-development-baseline.md 只摘要集成边界，不建立第二套阶段计划。
各 checkout 的变更尚未合并/提交；本轮没有证明旧 checkout 自动包含最新源码。

## 校验与交付边界

本轮核对新基准与语言、三端、身份、服务边界、计费、历史、恢复、部署和证据入口的一致性，
执行文档链接及 diff 检查。没有更改运行时代码、schema、SDK、密钥、价格或线上服务；无需部署。
新建/修改的第一方 Markdown 本地链接均有效；三个相关 Git 工作副本的 `git diff --check` 通过。
最终校验覆盖 Mural 92、Gateway 5、Worker checkout 6 个新增/修改 Markdown；无非文档改动。
归档内容与旧总计划逐字比对通过（仅新增失效说明、调整相对链接），原证据完整保留。
扫描另发现未修改的第三方 WebRTC notices 中既有 `README.ijg` 链接缺目标，保留原许可文本，
不将其伪装成本轮引入或擅改第三方声明。远程网页与供应商能力没有在本轮重新验证。
代码/契约测试沿用审查报告中的当时结果，不冒充本轮重新执行或设计已落地。
