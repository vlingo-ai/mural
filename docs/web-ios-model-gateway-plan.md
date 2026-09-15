# Mural Web、iOS、Android 与 Model Gateway 实施计划

## 1. 目标与边界

Mural 最终提供 Web UI 和 iOS 两种主要发布形式，同时保留 upstream 已有 Android
客户端的兼容性。三端只依赖 Mural API 的公开契约，不直接持有生产环境的 OpenAI
或第三方模型密钥。

Model Gateway 是独立仓库，负责所有模型供应商接入和路由；Mural API 负责产品业务、
用户、提示词、会话、学习数据、配额和计费。

本机现有工作目录：

```text
/Volumes/Kingston/MyProj/vlingo-ai/mural
/Volumes/Kingston/DeepTutor/model-gateway
/Volumes/Kingston/DeepTutor/model-gateway-phase-1-contracts
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

## 4. Model Gateway 的必要演进

当前 Model Gateway 是 Apple Silicon 上的 FastAPI + MLX 音频网关，已经实现 ASR、
强制对齐、阅读诊断和流式转写；LLM、Responses 和 Live 尚未实现。

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

- 在 `services/api/src/model-gateway/` 新增 Gateway client、超时、熔断和健康检查。
- 实现现有 `LiveProvider` 和 `HostedResponsesTransport` 接口的 Gateway adapter；保留
  `OpenAILiveProvider` 与 `OpenAIHostedResponses` 作为短期、显式关闭的回滚实现。
- 复用 upstream 已有 Live session broker、sideband、启动恢复、分钟账本、访客额度
  和托管 helper，不重新实现第二套业务后端。
- 将 iOS 现有 Responses 业务调用迁到 Mural API，由 API 组装业务 prompt。
- 补齐公开业务 inference 和会话事件契约；已有 Live 路由保持兼容。
- 使用现有账号体系鉴权；开发模式使用明确受限的本地凭据，不开放匿名生产接口。
- 增加 request ID、用户配额、审计日志和敏感字段脱敏。

验收：Mural API 的正常生产路径不再要求客户端 OpenAI key，也不直接调用模型供应商；
现有 Android/iOS、账号、账本、支付和托管语音测试不回归。

### Phase 5：Web MVP

默认技术栈：React + TypeScript + Vite，目录为 `apps/web/`。

- 登录/开发登录、麦克风权限、设备选择和连接状态。
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

验收：同一账号在 Web 和 iOS 看到一致的会话/学习状态；两端均不暴露生产 OpenAI key。

### Phase 7：统一业务数据与同步

- Mural API 成为会话、消息、字幕、翻译、评估和学习进度的权威存储。
- 定义 idempotency key、事件序号、断线续传、软删除和数据保留策略。
- iOS/Core 中仍有价值的纯算法保留；需要跨端一致的状态计算迁到 Server。
- 增加数据库迁移、并发更新和跨设备同步测试。

验收：Web 创建的会话可在 iOS 继续，反向亦然；重试不会产生重复账单或重复消息。

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

- Mural：upstream、origin 的 `main` 均为 `926fd95`；当前隔离分支已经 rebase 到该基线。
- Mural API：TypeScript 类型检查和构建通过；PostgreSQL 17.11 隔离实例下 353 项测试
  全部通过、0 项跳过、0 项失败；跨仓库 Gateway 契约检查通过。
- Model Gateway：`main`，提交 `13a33c4`，与 `origin/main` 同步且干净。
- Model Gateway：Ruff 通过；251 项非 Metal 测试通过，Metal 测试也已在沙箱外通过。
- Model Gateway：已有 `.venv` 和 `.env`，已有进程监听 8000；未读取或输出密钥。
- Mural Android：OpenJDK 17、Android platform 36/build-tools 35.0.0 已就绪；unit test、
  lint 和 debug assemble 通过。跨平台 Python 套件 53 项、内容导出和兼容检查通过。
- Mural iOS：Xcode 26.6、Swift 6.3.3、iOS 26.5 Simulator runtime 已就绪；74 项
  Swift 测试、generic Simulator build 和 iPhone 17 的 20 项 UI 测试全部通过。
- Phase 0 已完成；未进行付费模型调用。此前残留的 App Store `mas install` 进程已结束。

Phase 1 已在隔离分支完成首轮实现：

- Model Gateway 建立 provider-neutral `vlingo.model-gateway@1.0` 契约、可发现
  capabilities、Responses 与 Live WebRTC session 边界、可信双向 sideband、
  fail-closed 默认 provider、fake provider 和自动导出的 OpenAPI/JSON Schema。
- Mural 建立 Web/iOS/Android 公共 OpenAPI，冻结 Live 与四类业务 model task；客户端契约
  不包含模型、prompt、供应商 session ID 或 API key。
- Mural 只锁定 Gateway 协议要求，不复制其源契约；跨仓库兼容检查已通过。
- 最新 monorepo 引入 `apps/android/`、`apps/ios/`、`services/api/` 和
  `shared/contracts/`；2026-09-15 已完成 Phase 1 文件迁移和最新基线全量复验。

下一实施批次是 Phase 2：实现第一个真实 OpenAI Responses provider adapter，并用
fake HTTP upstream、严格限额和显式环境开关验证后，再进行一次用户授权的付费 smoke test。
