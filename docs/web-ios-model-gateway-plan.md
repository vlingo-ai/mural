# Mural Web、iOS、Android 与 Model Gateway 实施计划

## 1. 目标与边界

Mural 最终提供 Web UI 和 iOS 两种主要发布形式，同时保留 upstream 已有 Android
客户端的兼容性。三端只依赖 Mural API 的公开契约，不直接持有生产环境的 OpenAI
或第三方模型密钥。

Model Gateway 是独立仓库，负责所有模型供应商接入和路由；Mural API 负责产品业务、
用户、提示词、会话、学习数据、配额和计费。

学习目标语言收敛为三个稳定身份：英语 `en`、普通话 `zh` 和香港粤语 `yue`。
当前新会话只开放 `en` 与 `zh`；`yue` 在香港繁体、粤语语音和真人质量验收完成后
开放。挪威语、西班牙语、法语、德语、意大利语和葡萄牙语不再面向新用户展示，
但保留为历史可解码语言，不删除模块、不重写既有会话，也不把旧进度迁入三种产品语言。
本约束针对学习目标语言；界面本地化和释义字幕语言是独立产品决策。

本机现有工作目录：

```text
/Volumes/Kingston/MyProj/vlingo-ai/mural
/Volumes/Kingston/DeepTutor/model-gateway
/Volumes/Kingston/DeepTutor/model-gateway-phase-3-live       # 当前 Phase 3 隔离 worktree
```

两个仓库在逻辑、版本和部署上同级，不要求位于同一个本机父目录。

## 2. 目标架构

```text
                         Mural public API
┌──────────────┐       HTTPS / WebSocket       ┌──────────────────────┐
│  Mural Web   │ ────────────────────────────▶ │      Mural API       │
└──────┬───────┘                               │                      │
       │ WebRTC media                          │ auth / users         │
       │                                       │ prompts / learning   │
       ▼                                       │ sessions / billing   │
┌──────────────┐                               └──────────┬───────────┘
│ Live provider│                                          │ internal API
└──────────────┘                                          ▼
       ▲                                       ┌──────────────────────┐
       │ WebRTC media                          │    Model Gateway     │
┌──────┴───────┐       HTTPS / WebSocket       │                      │
│  Mural iOS   │ ────────────────────────────▶ │ provider routing     │
└──────────────┘       Mural public API         │ Live / Responses     │
                                                │ ASR / TTS / usage    │
                                                └──────────┬───────────┘
                                                           │ provider APIs
                                              ┌────────────┴────────────┐
                                              │ OpenAI / third parties │
                                              └─────────────────────────┘
```

Live 的默认链路：

1. Web 或 iOS 创建 WebRTC SDP offer。
2. 客户端把 offer 发送给 Mural API。
3. Mural API 调用 Model Gateway 创建 Live 会话。
4. Model Gateway 按逻辑模型和策略选择供应商，并把 offer 交给供应商。
5. SDP answer 经 Model Gateway、Mural API 返回客户端。
6. 音频在客户端与供应商之间走 WebRTC。
7. Model Gateway 使用供应商的可信 sideband 连接管理会话、工具和事件。

只有供应商不支持 WebRTC 时，才启用“客户端到服务器 WebSocket 音频代理”适配器。
这是一种供应商能力降级，不是默认架构。

## 3. Contracts 的归属

Contracts 属于各自服务，但不在客户端手工复制：

```text
mural/shared/contracts/
  mural-api.openapi.json       Web/iOS/Android 使用的公开业务 API
  events/                      公开实时事件 JSON Schema

mural/services/api/contracts/
  model-gateway.lock.json      API 锁定的 Gateway 最低兼容要求

model-gateway/contracts/
  openapi.yaml                 Mural API 使用的内部模型 API
  events/                      Live sideband 与用量事件 JSON Schema
```

- Mural API 拥有公开业务语义，例如学习会话、翻译、评估和用户配额。
- Model Gateway 拥有模型语义，例如逻辑模型、供应商能力、路由、推理和标准化用量。
- Web、iOS、Android 和 Mural API 从契约生成客户端或类型；Gateway 源契约不跨仓库复制。
- 每个契约使用显式版本和兼容性测试；新增字段默认可选，破坏性修改发布新版本。

### 3.1 语言身份与兼容边界

客户端核心采用两层注册表，避免把“停止销售”误做成“数据不可读”：

```text
knownLanguages       en, zh, nb, es, fr, de, it, pt；未来加入 yue
availableLanguages   en, zh；粤语验收后加入 yue
```

- `knownLanguages` 用于 archive 导入、历史记录、学习投影和跨平台兼容。
- `availableLanguages` 用于 onboarding、设置页和创建新会话。
- 新安装默认语言从 `nb` 改为 `en`；v1 archive 缺省语言仍按原规则迁移为 `nb`，两者
  必须使用不同常量，禁止静默重解释历史数据。
- 已选择旧语言的升级用户仍可查看历史；开始新会话前必须明确选择可用语言。
- Mural 公开 API 保留通用 `language` 字符串，服务端在业务层校验当前可用 locale；
  不把三种语言写成难以演进的供应商协议枚举。
- Model Gateway 只接收 Mural 组装好的语言指令，不负责定义产品语言名单。

香港粤语的稳定身份为 `yue`，首发 locale 为 `yue-Hant-HK`，书写采用香港繁体。
它与普通话 `zh` 完全分离：独立教学进度、词汇、评估、语音指导和测试 fixtures；
不得复用普通话拼音作为粤语注音，未来需要注音时使用经审核的粤拼。

## 4. Model Gateway 的必要演进

当前 Model Gateway 是 Apple Silicon 上的 FastAPI + MLX 音频网关，已经实现 ASR、
强制对齐、阅读诊断、流式转写和 OpenAI Responses。Phase 3 隔离分支已实现 OpenAI
Live WebRTC session creation 与可信 sideband，待合并和跨端真实语音验收。

为了同时支持本地 MLX 和可部署的云端模型代理，应先拆分运行能力：

- `gateway-core`：FastAPI、鉴权、路由、契约、OpenAI/第三方 HTTP 与 WebSocket 适配器；
  可运行在 Linux 或 macOS。
- `gateway-local-audio`：MLX、ONNX 和 Apple Silicon 音频能力；作为可选依赖和能力模块。
- 所有重型模型依赖保持懒加载；云端代理进程不能因为没有 Metal 而启动失败。

建议增加以下内部能力：

```text
GET  /v1/capabilities
GET  /v1/models
POST /v1/responses
POST /v1/live/sessions
WS   /v1/live/sessions/{session_id}/sideband
```

内部请求使用逻辑模型别名，不让 Mural API 依赖供应商型号。例如：

```text
mural.live.default
mural.reasoning.default
mural.translation.fast
mural.assessment.default
```

逻辑别名由 Model Gateway 映射到 OpenAI 或第三方模型，并返回标准化的供应商、
实际模型、token/音频用量、延迟、结束原因和错误类别。

## 5. Upstream 持续同步策略

Git 远端和分支职责固定为：

```text
upstream = https://github.com/Chuloo/mural.git   只读源仓库
origin   = https://github.com/vlingo-ai/mural    团队 Fork

upstream/main ─▶ sync/upstream-<sha> PR ─▶ origin/main
                                             └─▶ codex/phase-* worktree
```

- upstream 的 push URL 设置为 `no_push`，避免误推源仓库。
- `origin/main` 不直接开发；功能和同步都经独立分支、完整测试和 PR。
- `.github/workflows/upstream-sync.yml` 每日检查并支持手动运行。发现新提交时创建
  `sync/upstream-<sha>` 和 PR；遇到冲突立即失败，不强推、不自动采用 ours/theirs。
  自动 PR 创建后显式派发 Checks、Contracts 和 Android 工作流，避免默认
  `GITHUB_TOKEN` 创建的事件不触发后续工作流。
- 每个 Phase 开始前、长阶段至少每周，以及修改 upstream 高频文件前主动 fetch。
- 未共享的短期分支 rebase 到最新 main；已共享或多人使用的分支通过同步 PR 合并。
- 新功能优先放入 `apps/web/`、`services/api/src/model-gateway/` 和明确的 contracts
  目录，减少对 `main.ts`、`app.ts`、根构建文件等高频文件的修改。
- upstream 自动同步门禁覆盖 API/PostgreSQL、Swift Core、Android 和跨平台 fixtures；
  iOS Simulator build/UI 由 Xcode 26 本机验收。Web 建立后加入同一门禁；Gateway
  契约发布到可获取的分支或 tag 后启用跨仓库检查。任何必需项失败都不进入
  `origin/main`。

本地同步前保留可恢复备份分支。2026-09-15 的迁移备份为
`codex/phase-1-contracts-pre-upstream-20260915`。

## 6. 分阶段执行计划

### Phase 0：冻结基线与开发环境

工作内容：

- 记录两个仓库的分支、提交和工作区状态。
- 跑通 Mural API 的类型检查和测试。
- 跑通 Model Gateway 的 Ruff 和测试；Metal 专用测试在真实终端单独验收。
- 安装并选择完整 Xcode 后，跑通 `swift test` 和 iOS Simulator。
- 准备本地环境变量模板，所有真实密钥只放未提交的 `.env` 或 Keychain。

验收：两个仓库的离线测试全部通过；`swift test`、iOS Simulator build/test 和
PostgreSQL 集成测试均有成功记录；不进行付费模型调用。

当前状态：**Phase 0 已于 2026-09-15 完成**。验收记录：

- Xcode 环境已于 2026-09-14 关闭：已安装 Xcode 26.6（17F113），`xcode-select`
  指向 `/Applications/Xcode.app/Contents/Developer`，已接受许可并完成 first launch；
  Swift 6.3.3 的 74 项测试全部通过，iOS 26.5 Simulator runtime 已安装，generic
  Simulator build 成功。
- iPhone 17 / iOS 26.5 Simulator 的完整 UI 套件使用本地签名构建通过：20 项通过、
  0 项失败。此前白屏现象与首次加载 Xcode runtime 和 WebRTC 动态依赖时的系统安全
  扫描延迟一致；手动启动完成后未再复现，当前没有 Mural 或 WebRTC 兼容性缺陷证据。
- 已安装 PostgreSQL 17.11，并使用仅监听 `127.0.0.1:55434` 的一次性隔离实例和
  `mural_upstream_test` 数据库完成 Mural API 全量测试：353 项通过、0 项跳过、
  0 项失败。测试后实例已停止；未启用 Homebrew 常驻服务。
- 已安装 OpenJDK 17 和 Android SDK platform 36/build-tools 35.0.0；Android unit test、
  lint 和 debug assemble 全部通过。跨平台 Python 套件 53 项通过，生成内容与
  Swift/Kotlin 兼容检查通过。
- Mural API TypeScript 类型检查通过；与 Model Gateway 隔离 worktree 的
  `vlingo.model-gateway@1.0` 跨仓库契约检查通过。

Model Gateway 的 Metal 测试不是待修项目问题：它在 Codex 沙箱内无 GPU 权限，但同一
测试在沙箱外已经通过。

### Phase 1：先定义跨仓库契约

Model Gateway：

- 建立内部 OpenAPI 和 Live 事件 JSON Schema。
- 定义 capabilities、逻辑模型、Responses、Live session、sideband、usage、error。
- 为 OpenAI 和第三方差异定义能力字段，不伪装不存在的功能。
- 增加契约快照、schema 校验和向后兼容测试。

Mural：

- 建立公开 OpenAPI 和客户端事件契约。
- 定义登录用户创建 Live 会话、执行业务推理、查询会话和学习记录的接口。
- 生成 TypeScript 类型；为 Swift 生成或封装 Codable DTO。

验收：两仓库的契约测试通过；使用 fake provider 完成 SDP 与事件的闭环测试。

### Phase 2：Model Gateway Responses/LLM 路由

- 增加 provider adapter 接口和 OpenAI Responses adapter。
- 实现 `/v1/responses`、逻辑模型解析、超时、取消、限流和标准化用量。
- API key 只通过环境变量或 secret manager 注入。
- 对可安全重试和不可安全重试的请求做明确区分，避免重复计费。
- 先用 fake provider 做确定性测试，再执行一次有上限的真实 OpenAI smoke test。

验收：翻译、评估、普通文本回复和搜索四类 Mural 用例通过；日志不出现密钥或完整敏感内容。

### Phase 3：Model Gateway Live + sideband

- 增加 OpenAI Live adapter，接收 SDP offer 并返回标准化 session 与 SDP answer。
- 建立可信 sideband，管理 prompt、工具、委托任务、事件和会话关闭。
- 限制不可信客户端 DataChannel 可收发的事件集合。
- 标准化 session 生命周期、供应商错误、超时、用量和断线处理。
- 保持 WebRTC 音频直达供应商；实现 provider capability 决策。

验收：浏览器测试页和 iOS 测试客户端均能完成一次双向语音会话；Mural API 能收到 sideband 业务事件。

### Phase 4：Mural API 接入 Model Gateway

- 先完成 Phase 4A 契约扩展：Gateway 的标准化 Responses 结果必须携带经校验的搜索来源、
  实际 Web Search 调用数和缓存写入 token；Mural 不得猜测这些影响展示或计费的字段。
- 在 `services/api/src/model-gateway/` 新增 Gateway client、超时、熔断和健康检查。
- 实现现有 `LiveProvider` 和 `HostedResponsesTransport` 接口的 Gateway adapter；保留
  `OpenAILiveProvider` 与 `OpenAIHostedResponses` 作为短期、显式关闭的回滚实现。
- 复用 upstream 已有 Live session broker、sideband、启动恢复、分钟账本、访客额度
  和托管 helper，不重新实现第二套业务后端。
- 将 iOS 现有 Responses 业务调用迁到 Mural API，由 API 组装业务 prompt。
- 补齐公开业务 inference 和会话事件契约；已有 Live 路由保持兼容。
- 使用现有账号体系鉴权；开发模式使用明确受限的本地凭据，不开放匿名生产接口。
- 增加 request ID、用户配额、审计日志和敏感字段脱敏。
- 公开 Live session 入口仅接受 `en` 与 `zh-CN`；历史 provider locale 只保留在内部兼容层，
  `yue-Hant-HK` 在 Phase 7A 验收前必须被服务端拒绝。

验收：Mural API 的正常生产路径不再要求客户端 OpenAI key，也不直接调用模型供应商；
现有 Android/iOS、账号、账本、支付和托管语音测试不回归。

### Phase 5：Web MVP

默认技术栈：React + TypeScript + Vite，目录为 `apps/web/`。

- 登录/开发登录、麦克风权限、设备选择和连接状态。
- 新会话语言选择只展示 `en`、`zh`；`yue` 在专项验收完成前保持关闭。
- WebRTC offer/answer、音轨播放和受限 DataChannel。
- 实时字幕、翻译、文本输入、停止/重连和错误提示。
- 会话历史与基本学习结果，服务端为权威数据源，IndexedDB 仅作缓存。
- 单元测试、浏览器集成测试和无真实模型的 fake-provider E2E。

验收：本地执行一条命令启动 Web、Mural API、PostgreSQL，并连接现有 Model Gateway；随后完成一次受控的真实 Live smoke test。

### Phase 6：iOS 切换到共享后端

- 抽象 `LiveTransport` 和 `InferenceClient`，增加 Mural API 实现。
- Release 默认不接受或存储供应商 key；Debug 可暂时保留 BYOK 回滚模式。
- iOS 使用与 Web 相同的公开契约、鉴权、Live session broker 和学习数据接口。
- 增加离线缓存、恢复、登录过期和网络切换测试。
- Android 保留现有发布能力并消费同一公共契约；每次 API 变更运行 Android 契约和
  跨平台 fixtures，避免 Web/iOS 开发造成回归。
- 将客户端语言注册表拆成 `knownLanguages` 与 `availableLanguages`，新安装默认 `en`，
  同时冻结 v1 archive 的 `nb` 迁移语义；旧语言只读兼容不得阻止历史导入。

验收：同一账号在 Web 和 iOS 看到一致的会话/学习状态；两端均不暴露生产 OpenAI key。

### Phase 7：统一业务数据与同步

- Mural API 成为会话、消息、字幕、翻译、评估和学习进度的权威存储。
- 定义 idempotency key、事件序号、断线续传、软删除和数据保留策略。
- iOS/Core 中仍有价值的纯算法保留；需要跨端一致的状态计算迁到 Server。
- 增加数据库迁移、并发更新和跨设备同步测试。

验收：Web 创建的会话可在 iOS 继续，反向亦然；重试不会产生重复账单或重复消息。

### Phase 7A：香港粤语发布门禁

- 新增 `yue` / `yue-Hant-HK` 模块，使用香港繁体和独立粤语教学规则。
- 建立粤语书面语、口语字词、夹杂英语、普通话误切换、繁简体和粤拼 fixtures。
- 在 `gpt-live-1` 及计划支持的第三方 Live provider 上分别进行真人双向语音验收；
  官方未提供粤语质量保证，因此模型能连接或偶尔说粤语不算验收通过。
- 至少由胜任的香港粤语使用者审核问候、连续对话、打断、字幕、纠错和发音；质量不达标
  时保持 feature flag 关闭，不把 `zh` 降级冒充粤语。

验收：Web、iOS 和 Android 使用相同 `yue` 身份完成历史隔离和双向语音测试后，才将
`yue` 加入 `availableLanguages`。

### Phase 8：第二供应商与故障切换

- 选择一个实际第三方供应商，实现 Responses adapter。
- 根据其能力决定使用 WebRTC、原生 WebSocket，还是 Gateway 音频代理。
- 配置按租户、地区、模型能力、成本和健康状态路由。
- 默认不在进行中的语音会话里静默切换供应商；向客户端显式报告重连。

验收：同一 Mural 业务契约可切换两家供应商，provider contract tests 全部通过。

### Phase 9：部署、观测与发布

本地开发：

```text
Web dev server ─┐
iOS Simulator ──┼─▶ Mural API + PostgreSQL ────▶ Model Gateway on macOS
                │                                  ├─ MLX local audio
                └─ WebRTC media ───────────────────└─ OpenAI/third party
```

云端生产：

```text
CDN/Web + iOS
      │ HTTPS/WSS
Load Balancer
      │
Mural API replicas ─ PostgreSQL
      │ private HTTPS/WSS
Model Gateway core replicas ─ provider APIs
      │ optional private link
Apple Silicon audio worker(s)
```

- TLS、secret manager、数据库备份、迁移回滚和最小权限网络策略。
- 结构化日志、trace ID、延迟、断线率、provider 错误率和单位会话成本。
- Web 分阶段发布；iOS 经 TestFlight 验收后再提交 App Store。

验收：staging 完成 Web+iOS 端到端测试、故障演练、预算告警和回滚演练。

## 7. 跨仓库实施顺序

每个阶段按以下顺序提交，避免某个仓库长期依赖未发布接口：

1. Model Gateway：契约和 fake provider。
2. Mural：生成的内部 client 与契约测试，但功能开关保持关闭。
3. Model Gateway：真实 provider 实现并发布版本/tag。
4. Mural API：启用集成和公开 API。
5. Web/iOS：消费稳定的 Mural 公开 API；Android 运行兼容性回归。

Model Gateway 的契约版本应被 Mural API 锁定；升级先通过兼容测试，再更新版本。

## 8. 密钥与配置

生产密钥流向：

```text
OpenAI/第三方 API key  → Model Gateway secret manager
Gateway internal key   → Mural API secret manager
Mural user token       → Web/iOS/Android secure storage
```

Web bundle、浏览器 localStorage、iOS 源码、Git 仓库和客户端网络日志中不得出现模型供应商长期密钥。

开发环境建议变量：

```text
# model-gateway/.env
GATEWAY_API_KEY=...
OPENAI_API_KEY=...

# mural/services/api/.env
MODEL_GATEWAY_BASE_URL=http://127.0.0.1:8000
MODEL_GATEWAY_API_KEY=...
MODEL_GATEWAY_CONTRACT_VERSION=...
```

## 9. 当前基线与下一步

截至 2026-09-15：

- Mural：`upstream/main` 为 `926fd95`；`origin/main` 在该上游基线上包含已 squash 合并的
  Phase 1 提交 `f8d6c03`。Phase 3 分支从该提交创建。
- Mural API：TypeScript 类型检查和构建通过；PostgreSQL 17.11 隔离实例下 353 项测试
  全部通过、0 项跳过、0 项失败；跨仓库 Gateway 契约检查通过。
- Model Gateway：Phase 1/2 已 squash 合并到 `origin/main`，提交 `a464af8`；主 checkout
  保持干净，Phase 3 从该提交创建独立 worktree。
- Model Gateway：Ruff/format 通过；Phase 2 基线为 261 项非 Metal 测试通过，Metal
  测试也已在沙箱外通过。
- Model Gateway：主 checkout 保持在 `origin/main`；Phase 2 仅在独立 worktree 开发。
  本地 `.env` 被 Git 忽略且权限为 `0600`；没有输出或提交密钥。
- Mural Android：OpenJDK 17、Android platform 36/build-tools 35.0.0 已就绪；314 项
  unit test、lint 和 debug assemble 通过。跨平台 Python 套件 53 项、内容导出和
  兼容检查通过。
- Mural iOS：Xcode 26.6、Swift 6.3.3、iOS 26.5 Simulator runtime 已就绪；74 项
  Swift 测试、generic Simulator build 和 iPhone 17 的 18 项当前 UI 测试全部通过。
- Phase 0 已完成。此前残留的 App Store `mas install` 进程已结束。

Phase 1 已在隔离分支完成首轮实现：

- Model Gateway 建立 provider-neutral `vlingo.model-gateway@1.0` 契约、可发现
  capabilities、Responses 与 Live WebRTC session 边界、可信双向 sideband、
  fail-closed 默认 provider、fake provider 和自动导出的 OpenAPI/JSON Schema。
- Mural 建立 Web/iOS/Android 公共 OpenAPI，冻结 Live 与四类业务 model task；客户端契约
  不包含模型、prompt、供应商 session ID 或 API key。
- Mural 只锁定 Gateway 协议要求，不复制其源契约；跨仓库兼容检查已通过。
- 最新 monorepo 引入 `apps/android/`、`apps/ios/`、`services/api/` 和
  `shared/contracts/`；2026-09-15 已完成 Phase 1 文件迁移和最新基线全量复验。

Phase 2 的离线实现已通过 Model Gateway PR #8 squash 合并到 `main`（`a464af8`）：

- 增加 OpenAI Responses provider adapter；四个 Mural 逻辑模型分别由环境变量映射，
  不在代码中固定供应商模型 ID。
- provider 默认关闭；只有显式配置 `GATEWAY_MODEL_PROVIDER=openai`、服务端
  `OPENAI_API_KEY` 和至少一个模型映射时才启用。
- 支持文本、JSON Schema、reasoning、Web Search、标准化 usage、实际供应商模型和
  finish reason；Live 仍 fail closed，留给 Phase 3。
- 转发 `Idempotency-Key` 和 `X-Client-Request-Id`，创建结果未知时不自动重试；
  供应商错误不透传密钥或原始内容。
- 强制输入、输出 token、工具调用、并发和等待队列上限；超限在调用供应商前拒绝。
- Ruff/format 通过；261 项非 Metal 全量回归通过，唯一排除项仍是已记录的沙箱
  Metal 设备测试；Mural 跨仓库契约检查继续通过。

真实 OpenAI smoke test 已于 2026-09-15 通过：localhost-only Gateway 使用
`mural.translation.fast → gpt-5.6-luna` 完成一次 HTTP 200 请求，返回预期文本，usage
为 31 input、9 output、40 total tokens；`store=false`、32 output-token 上限、无工具、
无自动重试。测试后 Gateway 已停止且端口 8011 已关闭。Platform 当时显示余额为 0，
但请求成功；不据此推断账户的免费额度、后付费状态或余额刷新机制。

Mural Phase 1 已通过 PR #1 squash 合并到 `main`（`f8d6c03`），该 PR 的 contracts、
secret scan、Swift Core、Server、Android 和 Emulator 共 7 项检查全部通过。Emulator
首轮运行因设备进程从 ADB 消失而失败；报告没有业务断言，宿主机没有 OOM 证据，原
job 重跑后 61 项设备测试全部通过，因此未为该偶发基础设施故障修改产品代码。

Phase 2 的实现与真实调用门禁已完成。Phase 3 已从两个仓库各自最新 `origin/main`
创建 `codex/phase-3-live-sideband` 分支；Model Gateway 使用独立 worktree
`/Volumes/Kingston/DeepTutor/model-gateway-phase-3-live`，主 checkout 不承载本阶段修改。

Phase 3 Gateway 首轮实现已于 2026-09-15 完成：

- 使用官方 OpenAI Python SDK 3.14.x 创建 `gpt-live-1` WebRTC session，并建立可信
  sideband；OpenAI SDK 锁定在 `<4`，避免未经验证的主版本升级。
- Gateway 只返回自己的不透明 session ID；OpenAI API key 和上游 session ID 不跨越
  Gateway/Mural API 信任边界。
- DataChannel client/server event allowlist 在调用 OpenAI 前校验；model delegation
  必须解析到已配置的 Responses 逻辑别名。
- 标准化 ready、transcript、delegation、累计音频秒数、错误与关闭事件；支持
  mute/unmute、instructions/thinking/commentary、delegation result 和关闭命令。
- sideband 传输断开后允许可信后端重新连接；上游不支持的 response cancel 明确以
  `400` fail closed。
- Ruff/format、272 项全量测试（含 Metal 生命周期测试）和 Mural 跨仓库契约检查全部
  通过。本地 capabilities 冒烟返回 `mural.live.default`、`webrtc`、`sideband=true`，
  服务随后停止且端口关闭。
- 真实 OpenAI Live smoke 尚未执行：自动化浏览器环境无法提供可用 WebRTC offer，且
  安全策略禁止内联测试页。按计划在 Mural API adapter 和正式浏览器测试页接通后，
  执行一次无自动重试、短时、可立即关闭的 Web/iOS 双向语音验收。

Mural API 的 Live adapter 首轮实现也已完成：

- `services/api/src/model-gateway/` 新增 Gateway Live provider，复用 upstream 现有
  `HostedVoice` 会话、PostgreSQL 账本、恢复、分钟额度和关闭 watchdog。
- `MODEL_GATEWAY_URL` 与 `MODEL_GATEWAY_API_KEY` 必须成对配置；Gateway 为首选路径，
  原有 OpenAI 直连 provider 作为短期回滚实现保留。
- Mural 发送稳定逻辑模型、受限 history、服务端 prompt 和 DataChannel allowlist；
  只保存 Gateway 不透明 session ID，不保存 SDP、prompt、转写或音频；该内部 ID 不随
  `POST /v1/live/sessions` 的公开响应返回给 Web/iOS 客户端。
- Mural sideband 只接受协议版本、session ID 和 sequence 均有效的累计音频 usage 与
  terminal close；transcript 等业务事件不进入计费回调，连接丢失不结算。
- TypeScript check、无数据库单测和 PostgreSQL 17.11 全量 357 项测试全部通过；一次性
  数据库仅监听 `127.0.0.1:55434`，测试后已停止并删除临时数据目录。

2026-09-15 已冻结目标语言决策：产品最终只开放 `en`、`zh`、`yue`，其中粤语明确
采用香港繁体 `yue-Hant-HK`。旧语言采用“隐藏但保留历史解码”，不物理删除。
该兼容层已在 stacked 分支 `codex/language-availability` 完成首轮实现，不混入 Live PR：

- Swift 与生成的 Kotlin 注册表均拆成 `knownLanguages` 和 `availableLanguages`；前者保留
  八种既有语言，后者当前仅为 `en`、`zh`。
- 新安装默认语言改为 `en`，v1 archive 缺省语言继续固定迁移为 `nb`；学习投影、导入、
  历史记录和隐藏词仍能按原语言解码。
- iOS/Android onboarding、设置和新会话入口只接受可用语言；升级后仍处于历史语言的
  用户必须先选择英语或普通话，禁止以隐藏语言创建新会话。
- Mural API 的英语 locale 已与客户端统一为 `en`；Phase 4 接入共享后端时，再把公开
  会话入口的服务端 allowlist 从历史 provider 能力收紧为 `en`、`zh-CN`。
- Swift 74 项、Android 314 项、Python 53 项和 iPhone 17 Simulator UI 18 项测试通过；
  两端构建、Android lint、内容生成检查和跨平台契约检查通过。未调用任何付费模型。

Phase 4 已从语言兼容分支创建隔离分支 `codex/phase-4-gateway-api`。第一项服务端门禁已完成：
公开 `POST /v1/live/sessions` 只允许 `en` 与 `zh-CN`，而 `LiveProvider` 的八种旧 locale
仍保留给历史兼容测试和旧记录恢复；`yue-Hant-HK` 继续关闭。Responses adapter 开发前的
契约审计发现当前 Gateway 标准化响应没有保留搜索来源、实际搜索调用数和缓存写入 token，
因此这些字段被明确列为 Phase 4A，必须先在 Model Gateway 独立 worktree 中以向后兼容字段
补齐，再由 Mural adapter 消费，禁止以请求参数推断实际用量。
