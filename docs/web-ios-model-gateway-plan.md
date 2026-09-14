# Mural Web、iOS 与 Model Gateway 实施计划

## 1. 目标与边界

Mural 最终提供 Web UI 和 iOS 两种客户端。两端只依赖 Mural Server 的公开 API，
不直接持有生产环境的 OpenAI 或第三方模型密钥。

Model Gateway 是独立仓库，负责所有模型供应商接入和路由；Mural Server 负责产品业务、
用户、提示词、会话、学习数据、配额和计费。

本机现有工作目录：

```text
/Volumes/Kingston/MyProj/vlingo-ai/mural
/Volumes/Kingston/DeepTutor/model-gateway
```

两个仓库在逻辑、版本和部署上同级，不要求位于同一个本机父目录。

## 2. 目标架构

```text
                         Mural public API
┌──────────────┐       HTTPS / WebSocket       ┌──────────────────────┐
│  Mural Web   │ ────────────────────────────▶ │     Mural Server     │
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
2. 客户端把 offer 发送给 Mural Server。
3. Mural Server 调用 Model Gateway 创建 Live 会话。
4. Model Gateway 按逻辑模型和策略选择供应商，并把 offer 交给供应商。
5. SDP answer 经 Model Gateway、Mural Server 返回客户端。
6. 音频在客户端与供应商之间走 WebRTC。
7. Model Gateway 使用供应商的可信 sideband 连接管理会话、工具和事件。

只有供应商不支持 WebRTC 时，才启用“客户端到服务器 WebSocket 音频代理”适配器。
这是一种供应商能力降级，不是默认架构。

## 3. Contracts 的归属

Contracts 属于各自服务，但不在客户端手工复制：

```text
mural/server/contracts/
  openapi.yaml                 Web/iOS 使用的公开业务 API
  events/                      公开实时事件 JSON Schema

model-gateway/contracts/
  openapi.yaml                 Mural Server 使用的内部模型 API
  events/                      Live sideband 与用量事件 JSON Schema
```

- Mural Server 拥有公开业务语义，例如学习会话、翻译、评估和用户配额。
- Model Gateway 拥有模型语义，例如逻辑模型、供应商能力、路由、推理和标准化用量。
- Web、iOS 和 Mural Server 从契约生成客户端或类型；契约源文件不跨仓库复制。
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

内部请求使用逻辑模型别名，不让 Mural Server 依赖供应商型号。例如：

```text
mural.live.default
mural.reasoning.default
mural.translation.fast
mural.assessment.default
```

逻辑别名由 Model Gateway 映射到 OpenAI 或第三方模型，并返回标准化的供应商、
实际模型、token/音频用量、延迟、结束原因和错误类别。

## 5. 分阶段执行计划

### Phase 0：冻结基线与开发环境

工作内容：

- 记录两个仓库的分支、提交和工作区状态。
- 跑通 Mural Server 的类型检查和测试。
- 跑通 Model Gateway 的 Ruff 和测试；Metal 专用测试在真实终端单独验收。
- 安装并选择完整 Xcode 后，跑通 `swift test` 和 iOS Simulator。
- 准备本地环境变量模板，所有真实密钥只放未提交的 `.env` 或 Keychain。

验收：两个仓库的离线测试全部通过；`swift test`、iOS Simulator build/test 和
PostgreSQL 集成测试均有成功记录；不进行付费模型调用。

当前状态：**Phase 0 尚未完成**。必须关闭以下环境项：

- Xcode 环境已于 2026-09-14 关闭：已安装 Xcode 26.6（17F113），`xcode-select`
  指向 `/Applications/Xcode.app/Contents/Developer`，已接受许可并完成 first launch；
  Swift 6.3.3 的 70 项测试全部通过，iOS 26.5 Simulator runtime 已安装，generic
  Simulator build 成功。
- iPhone 17 UI 测试仍需关闭：测试目标可编译、签名、安装并启动，但 Mural 在进入
  SwiftUI 前稳定白屏；进程采样显示 dyld 阻塞于加载动态依赖的 `open` 调用。关闭
  `CODE_SIGNING_ALLOWED=NO`、使用 `Sign to Run Locally` 并冷启动模拟器后仍可复现，
  因此需要继续检查 WebRTC 152.0.0 与 Xcode 26.6 / iOS 26.5 Simulator 的加载兼容性。
- 准备隔离的 PostgreSQL 测试实例并设置 `TEST_DATABASE_URL`。当前本机没有 Docker、
  PostgreSQL、Podman 或 Colima，因此 Mural Server 的 52 项数据库集成测试会跳过。

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

验收：浏览器测试页和 iOS 测试客户端均能完成一次双向语音会话；Mural Server 能收到 sideband 业务事件。

### Phase 4：Mural Server 接入 Model Gateway

- 新增 Gateway client、连接池、超时、熔断和健康检查。
- 将现有 `OpenAILiveProvider` 替换成 Gateway provider；保留短期回滚开关。
- 将 iOS 现有 Responses 业务调用迁到 Mural Server，由 Server 组装业务 prompt。
- 增加公开 Live session broker、业务 inference 和会话事件接口。
- 使用现有账号体系鉴权；开发模式使用明确受限的本地凭据，不开放匿名生产接口。
- 增加 request ID、用户配额、审计日志和敏感字段脱敏。

验收：Mural Server 不再要求客户端 OpenAI key，也不直接调用模型供应商；现有账号、账本和托管语音测试不回归。

### Phase 5：Web MVP

默认技术栈：React + TypeScript + Vite，目录为 `mural/web/`。

- 登录/开发登录、麦克风权限、设备选择和连接状态。
- WebRTC offer/answer、音轨播放和受限 DataChannel。
- 实时字幕、翻译、文本输入、停止/重连和错误提示。
- 会话历史与基本学习结果，服务端为权威数据源，IndexedDB 仅作缓存。
- 单元测试、浏览器集成测试和无真实模型的 fake-provider E2E。

验收：本地执行一条命令启动 Web、Mural Server、PostgreSQL，并连接现有 Model Gateway；随后完成一次受控的真实 Live smoke test。

### Phase 6：iOS 切换到共享后端

- 抽象 `LiveTransport` 和 `InferenceClient`，增加 Mural Server 实现。
- Release 默认不接受或存储供应商 key；Debug 可暂时保留 BYOK 回滚模式。
- iOS 使用与 Web 相同的公开契约、鉴权、Live session broker 和学习数据接口。
- 增加离线缓存、恢复、登录过期和网络切换测试。

验收：同一账号在 Web 和 iOS 看到一致的会话/学习状态；两端均不暴露生产 OpenAI key。

### Phase 7：统一业务数据与同步

- Mural Server 成为会话、消息、字幕、翻译、评估和学习进度的权威存储。
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
iOS Simulator ──┼─▶ Mural Server + PostgreSQL ─▶ Model Gateway on macOS
                │                                  ├─ MLX local audio
                └─ WebRTC media ───────────────────└─ OpenAI/third party
```

云端生产：

```text
CDN/Web + iOS
      │ HTTPS/WSS
Load Balancer
      │
Mural Server replicas ─ PostgreSQL
      │ private HTTPS/WSS
Model Gateway core replicas ─ provider APIs
      │ optional private link
Apple Silicon audio worker(s)
```

- TLS、secret manager、数据库备份、迁移回滚和最小权限网络策略。
- 结构化日志、trace ID、延迟、断线率、provider 错误率和单位会话成本。
- Web 分阶段发布；iOS 经 TestFlight 验收后再提交 App Store。

验收：staging 完成 Web+iOS 端到端测试、故障演练、预算告警和回滚演练。

## 6. 跨仓库实施顺序

每个阶段按以下顺序提交，避免某个仓库长期依赖未发布接口：

1. Model Gateway：契约和 fake provider。
2. Mural：生成的内部 client 与契约测试，但功能开关保持关闭。
3. Model Gateway：真实 provider 实现并发布版本/tag。
4. Mural Server：启用集成和公开 API。
5. Web/iOS：消费稳定的 Mural 公开 API。

Model Gateway 的契约版本应被 Mural Server 锁定；升级先通过兼容测试，再更新版本。

## 7. 密钥与配置

生产密钥流向：

```text
OpenAI/第三方 API key  → Model Gateway secret manager
Gateway internal key   → Mural Server secret manager
Mural user token       → Web/iOS secure storage
```

Web bundle、浏览器 localStorage、iOS 源码、Git 仓库和客户端网络日志中不得出现模型供应商长期密钥。

开发环境建议变量：

```text
# model-gateway/.env
GATEWAY_API_KEY=...
OPENAI_API_KEY=...

# mural/server/.env
MODEL_GATEWAY_BASE_URL=http://127.0.0.1:8000
MODEL_GATEWAY_API_KEY=...
MODEL_GATEWAY_CONTRACT_VERSION=...
```

## 8. 当前基线与下一步

截至 2026-09-14：

- Mural：`main`，当前工作区在制定本计划前为干净状态。
- Mural Server：TypeScript 类型检查通过；82 项测试中 30 项通过、52 项因未配置
  `TEST_DATABASE_URL` 按设计跳过、0 项失败。
- Model Gateway：`main`，提交 `13a33c4`，与 `origin/main` 同步且干净。
- Model Gateway：Ruff 通过；251 项非 Metal 测试通过，Metal 测试也已在沙箱外通过。
- Model Gateway：已有 `.venv` 和 `.env`，已有进程监听 8000；未读取或输出密钥。
- Mural iOS：Xcode 26.6、Swift 6.3.3、iOS 26.5 Simulator runtime 已就绪；70 项
  Swift 测试和 generic Simulator build 通过。iPhone 17 UI 测试仍因启动阶段 dyld
  加载 WebRTC 时白屏而未完成。
- Mural Server：Phase 0 未完成；需要 PostgreSQL 测试实例后运行当前跳过的 52 项集成测试。

Phase 1 已在隔离分支完成首轮实现：

- Model Gateway 建立 provider-neutral `vlingo.model-gateway@1.0` 契约、可发现
  capabilities、Responses 与 Live WebRTC session 边界、可信双向 sideband、
  fail-closed 默认 provider、fake provider 和自动导出的 OpenAPI/JSON Schema。
- Mural 建立 Web/iOS 公共 OpenAPI，冻结 Live 与四类业务 model task；客户端契约
  不包含模型、prompt、供应商 session ID 或 API key。
- Mural 只锁定 Gateway 协议要求，不复制其源契约；跨仓库兼容检查已通过。
- Model Gateway 非 Metal 测试 251 项通过；Mural Server 30 项通过、52 项数据库测试
  按设计跳过、0 项失败。

下一实施批次是 Phase 2：实现第一个真实 OpenAI Responses provider adapter，并用
fake HTTP upstream、严格限额和显式环境开关验证后，再进行一次用户授权的付费 smoke test。
