# vLingo Speaking Live（Mural 下游）Web、iOS、Android 与 Model Gateway 实施计划

## 1. 目标与边界

本仓库基于 MIT 许可的 Mural 上游持续开发，对外产品名固定为 **vLingo Speaking Live**，
基础设施 slug 固定为 `vlingo-speaking-live`，域名命名空间为 `vlingo.ai`。产品最终提供
Web UI 和 iOS 两种主要发布形式，同时保留 upstream 已有 Android 客户端的兼容性。
三端只依赖 Mural API 的公开契约，不直接持有生产环境的 OpenAI
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
/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit  # 当前 Phase 5.5 隔离 worktree（包含 Phase 3/4）
```

两个仓库在逻辑、版本和部署上同级，不要求位于同一个本机父目录。

### 1.1 品牌、上游与内部兼容标识

从 Phase 5.5B 起，所有新建且不便更名的外部资源直接使用正式产品命名：

```text
产品显示名              vLingo Speaking Live
基础设施 slug           vlingo-speaking-live
LiveKit projects        vlingo-speaking-live-dev / staging / prod
staging Web             speaking-live-staging.vlingo.ai
staging API             api-speaking-live-staging.vlingo.ai
production Web          speaking-live.vlingo.ai（是否使用根域名另行评审）
production API          api-speaking-live.vlingo.ai
日志/监控标签            product=vlingo-speaking-live, environment=<env>
```

命名变更采用分层演进，不做全仓机械替换：

- 用户可见界面、OAuth consent、域名、LiveKit project、部署资源、日志标签和发布物使用
  `vLingo Speaking Live` 或 `vlingo-speaking-live`。
- Git 仓库、`upstream` remote、既有 Swift/Python/TypeScript module、数据库迁移、协议字段
  和历史 archive 中的 `mural` 暂时保留，除非有独立迁移和兼容测试。
- 对外文档应说明 Mural 上游来源和 MIT 许可；品牌切换不得删除版权、许可或 attribution。
- 新代码不得仅为改名复制公开契约或重写历史数据。未来如调整 package、bundle identifier
  或数据库标识，必须单独评审迁移和 upstream 合并成本。

## 2. 目标架构

```text
                         Mural public API
┌──────────────┐       HTTPS / WebSocket       ┌──────────────────────┐
│ vLingo Web   │ ────────────────────────────▶ │      Mural API       │
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
│ vLingo iOS   │ ────────────────────────────▶ │ provider routing     │
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

在进入 Phase 6 前增加 Phase 5.5，验证是否把默认实时媒体链路收敛为 LiveKit。
OpenAI 官方将 LiveKit 列为 GPT-Live partner integration；该阶段只验证
`gpt-live-1`，不接入 Gemini 或其他第二供应商。验证通过前，本节描述的现有 OpenAI
直连链路仍是稳定回滚路径；验证通过后再以独立 ADR 更新目标架构，不能在 spike 中
提前删除或改写稳定路径。

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
- 冻结 iOS 现有 Responses 调用到公开 model-task 的映射；实际调用点与 iOS
  `LiveTransport` 在 Phase 6 原子切换。translation、assessment 和 teaching reply
  必须使用 Mural 签发的公开 Live `sessionID` 结算，不能拿供应商 session ID 冒充，
  也不能为了提前迁移而改用账户余额；独立 account-funded topic search 不受此依赖限制。
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

### Phase 5.5：LiveKit + GPT-Live 单供应商验证

目标：只验证 LiveKit 能否在不改变 Mural 产品语义的前提下，完整承载当前
`gpt-live-1` 功能，并据此决定 Phase 6 是否采用 LiveKit-only 客户端媒体链路。

明确不在本阶段实施：

- 不接入 Gemini Live 或任何第二供应商。
- 不设计以 Gemini WebSocket 为前提的公开 transport union。
- 不实现会话中供应商切换、自动故障转移或多供应商路由。
- 不删除现有 OpenAI WebRTC、Gateway sideband 或 Mural 回滚实现。
- 不把本机自托管开发环境直接视为生产部署，也不在 spike 结论前承诺 LiveKit Cloud
  Scale、Region Pinning 或完全自托管的生产拓扑。

部署演进固定为三个连续步骤，后一步不能阻塞当前本机功能验证：

```text
Phase 5.5A  本机自托管验证
Web + Mural API + LiveKit Server + Agent Worker 均在开发机运行
                         │ 功能门禁通过
                         ▼
Phase 5.5B  LiveKit Cloud Build 混合部署验证
LiveKit Cloud 承载房间/媒体；Mural API、Model Gateway、Agent Worker 由产品方自托管
                         │ 云端链路、观测与安全门禁通过
                         ▼
Phase 5.5C  LiveKit Cloud Ship：vLingo Speaking Live 产品内测
相同混合拓扑，使用付费额度、容量告警、预算和内测发布控制
```

其中“混合部署”不改变业务和密钥边界：Mural API 负责身份、短期 room token、额度和
结算；LiveKit Cloud 只承载实时房间、信令和媒体；自托管 Agent Worker 使用 Mural
运营方的服务端 `OPENAI_API_KEY` 直连 OpenAI。注册用户每次会话只获得短期 LiveKit
room token，不输入、不持有也不向 LiveKit 传递 OpenAI API key。LiveKit Cloud 与
OpenAI API 分别计费，前者不包含后者的模型费用。

#### Phase 5.5A：本机自托管 LiveKit 功能验证（当前）

实施步骤：

1. 在隔离分支/worktree 中运行最小 LiveKit 开发环境；优先使用本地开发服务器，避免
   为技术验证提前绑定生产托管方案。
2. 在 Model Gateway 仓库增加独立的 Live Agent Worker，由它加入 LiveKit room，并使用
   LiveKit 官方 OpenAI 插件的 `GPTLiveModel` 连接 `gpt-live-1`。Provider 密钥只存在于
   可信 Worker 环境，不进入 Web、iOS 或 Mural API。
3. Mural API 继续负责用户鉴权、会话创建、额度预留、强制关闭和最终结算；它只签发
   短期 room token 并接收可信的生命周期及 usage 事件，不处理音频、SDP 或供应商原始事件。
4. Web 测试客户端只使用 LiveKit WebRTC SDK 加入房间；不同时加入 Gemini 或自定义
   PCM WebSocket，以保证本阶段只回答单一架构问题。
5. 复用当前 Mural 的英语/普通话指令、会话历史、字幕、翻译、文本输入、打断、委托
   Responses/工具、停止、断网恢复和分钟账本，避免把 LiveKit 示例对话误当作 Mural 验收。
6. 先用 fake provider 和确定性事件验证创建、关闭、usage、余额耗尽和失败结算；账户
   具备额度后再执行一次有上限的真实 `gpt-live-1` 语音 smoke。

本步骤只追求以最少外部依赖跑通当前 Mural 的 `gpt-live-1` 功能。LiveKit Server、
Agent Worker、Mural API、Web 和必要的 Model Gateway 服务均可在本机运行；不得为了
提前模拟生产而引入 Kubernetes、多区域路由、Region Pinning 或第二供应商。

验收门禁：

- 同一个 Web 客户端只通过 LiveKit WebRTC 完成英语和普通话双向语音、自然打断、字幕、
  文本输入、工具/委托与主动停止。
- 客户端和浏览器网络请求中不存在 OpenAI API key；Mural 能可信获得累计 usage，并在
  余额耗尽、用户停止或 Worker 丢失时安全结算且不遗留 reservation。
- 现有 OpenAI 直连测试保持通过，能够作为可显式启用的回滚路径。
- 记录首音延迟、打断延迟、断线恢复、CPU/内存和额外媒体带宽；与当前直连基线相比
  没有不可接受的产品回归。
- 明确产出一份 ADR：若通过，Phase 6 采用 LiveKit-only 客户端媒体链路；若不通过，
  保留当前直连架构并单独处理后续供应商，不以 spike 代码改变生产默认值。

#### Phase 5.5B：LiveKit Cloud Build 混合部署验证（5.5A 通过后）

目标：不改变已经通过的产品协议，把房间和媒体层从本机 LiveKit Server 替换成
LiveKit Cloud Build；Mural API、Model Gateway 和 Agent Worker 仍由产品方自托管，
优先部署在新加坡或日本测试环境。

- 建立独立的非生产 LiveKit Cloud project `vlingo-speaking-live-staging`；若尚未投入使用的
  `mural-staging` 已因平台限制无法更名，则重新创建正式命名项目并停用旧项目。API secret
  只保存在 Mural API 的服务端
  secret store，OpenAI key 只保存在 Agent Worker 的 secret store。
- staging 默认使用 `speaking-live-staging.vlingo.ai` 和
  `api-speaking-live-staging.vlingo.ai`；DNS、TLS、容器、监控和预算标签均使用正式 slug，
  不再新建 `mural-*` 外部资源。
- Mural API 使用 Cloud URL/API credential 建房、dispatch、签发最小权限短期 room token
  和删房；Web/iOS 仍只消费 Mural 的公开会话响应。
- 验证用户与自托管 Worker 跨公网加入同一 room、TLS/WSS、NAT、防火墙、断线恢复、
  Worker 丢失、强制关闭和 reservation 清理。
- 验证 LiveKit dashboard/metrics 与 Mural session ID 的非敏感关联，建立 participant
  minutes、下行流量、错误率和并发告警；禁止把 transcript、OpenAI key 或长期用户凭据
  写入 room metadata 和日志。
- 记录 Cloud 相对本机的首音/打断延迟和媒体带宽。Build 免费额度是验证上限，不作为
  无限制生产容量；达到额度或并发上限时必须 fail closed 并给用户明确错误。
- 不启用 Region Pinning。默认由 LiveKit 自动选区；只有合同、监管或数据驻留要求必须
  把 LiveKit 信令和媒体限制在指定区域时，才另行评审 Scale 方案。Pinning 不控制
  Agent Worker、OpenAI、数据库、录音或日志的数据地域。

##### Model Gateway 可移植部署工作包

目标是保持一套 Model Gateway 代码和公开契约，通过配置选择 macOS MLX、本地禁用、
公网 ASR provider 或远程 Forced Aligner；不得复制一套 Linux 专用网关。ASR 与
Forced Alignment 是两个独立能力和故障域，必须分别装配、发布 capability、限流和鉴权。

LiveKit-only 架构不在 Model Gateway 增加 `GATEWAY_LIVE_BACKEND` 或产品级 Live
capability。职责固定为：

```text
Mural API       聚合产品 live_session capability、权限、余额、并发和 kill switch
Agent Worker    配置并连接实时 provider/model，向 Mural 报告就绪和生命周期
Model Gateway   提供 Responses、ASR、Alignment 及其他非实时模型路由
Web/iOS         只读取 Mural 的产品 capability，不查询 Model Gateway 内部配置
```

实时会话中的 client delegation 仍按
`Agent Worker → Mural API → Model Gateway Responses Router` 执行；这只依赖 Responses
capability，不使 Model Gateway 成为 Live capability 的所有者。既有 Gateway hosted-live
实现暂时保留为 legacy/显式回滚路径，不参与 LiveKit 产品可用性判断，也不为它新增部署参数。

配置模型冻结为：

```text
GATEWAY_ASR_BACKEND=disabled|mlx|provider
GATEWAY_ASR_DEFAULT_ROUTE=<logical-route>

GATEWAY_ALIGNMENT_BACKEND=disabled|mlx|remote
GATEWAY_ALIGNMENT_DEFAULT_ROUTE=<logical-route>

GATEWAY_READING_DIAGNOSTICS_ALIGNMENT_ROUTE=<logical-route>
```

其中 `provider` 表示经 provider-neutral router 调用公网或自托管 ASR adapter；`remote`
表示调用受信任的独立 Forced Alignment 推理节点。供应商密钥和 remote token 只存在于
Model Gateway 服务端 secret store，不进入 Mural API、Web 或 iOS。

实施顺序：

1. **冻结装配边界**：保留 `ASRBackend` 与 `AlignmentBackend` 独立协议；新增 backend
   factory/router，不再由默认 `Qwen3ASRBackend` 隐式决定两个能力是否同时可用。
2. **拆分运行依赖**：建立 core、macOS MLX 和 cloud/provider 依赖 profile。Linux
   Responses-only 镜像不得安装或 import `mlx-audio`；macOS 当前 MLX 默认行为保持兼容。
3. **实现独立开关**：ASR 与 Alignment 各自支持 `disabled`；禁用的 endpoint fail closed，
   返回稳定的 `503/backend_disabled`，不得因缺少 MLX/CUDA 包而在请求时崩溃。
4. **发布真实 capability**：`/v1/audio/capabilities` 按 operation 声明 availability、reason、
   route/model 和时间戳来源。旧客户端调用禁用操作时仍获得稳定错误；协议升级保持
   `deeptutor.audio 1.1` 历史响应可解码，必要的新字段必须是向后兼容的可选扩展。
5. **接入 provider-neutral ASR**：以逻辑 route 选择 adapter，标准化文本、语言、word timing、
   usage、provider request ID 和错误；新供应商首次接入仍需 adapter/capability 映射，不能
   假定所有“OpenAI 兼容”端点具有相同音频语义。
6. **预留独立 Aligner 节点**：remote adapter 接收音频、确认文本和语言，返回词/字级时间戳；
   它可以与 ASR 使用不同供应商、区域和凭据。后续允许先启用 Aligner、继续禁用 ASR。
7. **明确组合策略**：普通 transcription 可选择 provider timestamps、独立 Aligner 或无
   timestamps；reading diagnostics 必须使用配置的可信对齐 route，不得把供应商时间戳
   静默冒充 Qwen ForcedAligner 证据。ASR 禁用时 reading diagnostics 同步标记不可用。
8. **完成测试矩阵**：覆盖 `mlx+mlx`、`disabled+disabled`、`disabled+remote alignment`、
   `provider ASR+remote alignment`，以及缺失密钥、超时、429、5xx、错误响应、临时音频清理
   和 capability/503 契约；真实 provider smoke 必须有费用上限且不记录原始音频。

Phase 5.5B 首次云部署固定使用：

```text
GATEWAY_ASR_BACKEND=disabled
GATEWAY_ALIGNMENT_BACKEND=disabled
```

此时只启用 Model Gateway core/Responses 能力，先完成 LiveKit Cloud 混合部署门禁。后续按
“remote Forced Aligner → 公网 ASR provider”的顺序增量启用，不把 GPU 节点作为 5.5B
首轮验收前置条件。

Live 配置保持在真正的能力所有者：Mural 使用 `MURAL_LIVE_TRANSPORT=livekit-room|disabled`；
Agent Worker 使用自己的 provider/model 配置。不得把具体 Responses provider/model 固定为
delegation 的产品契约；Mural 只发送 `mural.reasoning.default` 等逻辑模型，由 Model Gateway
按部署配置选择实际供应商和模型。

Model Gateway 另有项目并行开发。任何实现开始前必须在最新 `main` 基线上新建专用
worktree/分支，向该项目协调者报告基线 commit、预计文件范围和运行服务影响；不得直接在
共享 `main` 或当前运行服务目录修改、切换、重启，也不得复用 Phase 5.5 旧分支中已经合并
或漂移的提交。涉及 `app.py`、`config.py`、capabilities/schema、依赖文件或 audio backend
的重叠变更，先约定合并顺序和契约所有权，再开始编码。

验收：英语和普通话的完整功能门禁在 Cloud Build 重跑通过；客户端仍无供应商密钥；
云端中断或额度耗尽时安全结算；形成一份带真实 participant-minutes、流量、延迟和错误率
的验证报告。

#### Phase 5.5C：LiveKit Cloud Ship 产品内测（5.5B 通过后）

目标：以 `vLingo Speaking Live` 正式品牌，使用相同混合部署拓扑支持受控真实用户内测，
不在此步引入新 transport 或供应商。

- 升级独立 staging/内测 project 到 Ship；将开发与内测 project、credential、room 前缀
  和监控完全隔离。
- 为 vLingo Speaking Live 账号建立白名单/feature flag、并发上限、每日和每用户分钟预算、总成本熔断、
  速率限制和可立即关闭的 kill switch。
- 按“一分钟双人房间约等于两个 WebRTC participant-minutes”建立容量模型，同时监控
  下行 GB；LiveKit、OpenAI 和自托管基础设施分别记账与告警，禁止把 LiveKit 账单视为
  已包含 OpenAI 推理费用。
- Agent Worker 至少验证滚动发布、健康检查、受控并发、崩溃恢复和无遗留 reservation；
  Mural API 与 Model Gateway 按既有生产安全门禁部署。
- 运行小规模 Web 内测，再运行 iOS/TestFlight 内测；收集成功率、首音/打断延迟、重连率、
  每会话成本和用户反馈，达到预算与可靠性门槛后才扩大范围。
- Ship 阶段仍使用 LiveKit 自动路由。若内测客户提出硬性区域隔离要求，再单独制定
  Scale + Region Pinning 验证，不把它默认加入当前路线。

验收：受控用户在 Web/iOS 可稳定完成会话；预算、配额、告警、结算、回滚和 kill switch
均演练通过；形成是否进入正式发布以及是否需要 Scale/Region Pinning 的决策记录。

当前进度（2026-09-17）：

- [x] 隔离 Model Gateway worktree 与独立 LiveKit Worker 依赖环境。
- [x] 本地 LiveKit Server 启动、Worker 注册，以及 Mural 建房/dispatch/token/删房冒烟。
- [x] Mural 短期 room token、可信 usage/delegation 回调、Web capability 与回滚传输契约。
- [x] Web LiveKit 音频发布/订阅、字幕、`lk.chat` 文本输入及 SDK 按需加载。
- [x] Worker 使用 `gpt-live-1`、`delegation=client`，教学回复仍走 Mural → Model Gateway。
- [x] fake/确定性验证与现有 WebRTC 回归测试。
- [x] 真实零余额拒绝：请求到达 OpenAI；`credit_balance_exhausted` 不重试，Mural 以
  0ms/0 成本关闭并完整释放 600000ms 预留，Web 不误报 Active。
- [x] 有余额账户完成 OpenAI `session.started`、LiveKit 双端音频轨、Web Active、
  主动停止与结算回归：600000ms 预留结算为 15000ms，reservation 为 settled，
  钱包 `reserved_ms=0`；重复删房的精确 404 不再导致 `sideband_lost`。
- [x] 真实麦克风英语双向语音、字幕、远端音频播放和非零 provider usage：修复 Web
  包装原生 `MediaStreamTrack` 时未声明 `Track.Source.Microphone`、导致 Agent 忽略
  `SOURCE_UNKNOWN` 输入的问题。真实会话完成两轮往返，最终观察 21000ms、扣除
  21000ms、`reserved_ms=0`，主动停止原因是 `user_requested`；同时修复主动断开被 UI
  误报为 `Failed` 的状态竞态。
- [x] 普通话双向语音、自然打断与对应字幕验收：用户听到普通话回复；插话立即停止旧回复，
  新问题得到回答；会话最终观察/扣除 126000ms，钱包余额 474000ms、`reserved_ms=0`。
- [x] 浏览器主动离开/断开路径验收：Worker 获得正常 shutdown callback、提交最终累计 usage，
  Mural 完成关闭和 reservation 结算。
- [x] 单会话本机资源与媒体基线：LiveKit Server 约 91MB RSS；Worker 主进程约 82MB，活跃
  Agent 子进程约 346MB；浏览器上行语音约 77kbps。该数据仅为开发机单样本，不作为生产
  容量承诺。
- [x] Worker 硬崩溃和无遗留 reservation 验收：Agent 每 5 秒经 HMAC 控制通道续期 30 秒
  lease 并提交累计 usage。SIGKILL 后 Web 自动显示 Failed，Mural 删除 room、按最后可信
  31000ms 结算，600000ms reservation 释放为 0；会话以 `worker_lease_expired` 关闭并设置
  `provider_usage_final=false`，明确要求运营方对账且由运营方承担租约窗口内的未知差额。
- [x] 短时网络中断自动重连：暂停并恢复同一 LiveKit Server 进程模拟丢包，Web/Agent 经
  ping timeout 和 resume 流程恢复；恢复后发送文本并收到 GPT-Live 回复，会话保持 Active。
  主动关闭后最终观察/扣除 71000ms，`provider_usage_final=true`、`reserved_ms=0`。
- [x] `docs/adr/0001-livekit-gpt-live-spike.md` 已改为 Accepted；Phase 5.5A 本机自托管
  功能与可靠性门禁完成，可进入 Phase 5.5B Cloud Build 验证。Phase 6 的正式 LiveKit-only
  切换仍以 5.5B/5.5C 的部署和内测结果为条件。

### Phase 6：iOS 切换到共享后端

- 以 Phase 5.5 ADR 为前置门禁：通过则让 Web/iOS 统一使用 LiveKit SDK 和 Mural room
  凭据；未通过则保留当前 `LiveTransport` 抽象和 OpenAI WebRTC 路径。
- 抽象 `InferenceClient`，增加 Mural API 实现；不得把 LiveKit、OpenAI 或供应商型号
  泄漏到学习业务接口。
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
MODEL_GATEWAY_URL=http://127.0.0.1:8000
MODEL_GATEWAY_API_KEY=...
```

## 9. 当前基线与下一步

截至 2026-09-16：

- Mural：`upstream/main` 已前进到 `3a12147`（Android preview 7）；独立同步 PR #5
  全矩阵通过后以 merge commit `ff96e59` 进入 `origin/main`，保留 upstream 祖先关系。
  stacked PR #2、#3、#4 随后按顺序重基并使用 `--force-with-lease` 更新，没有把同步
  改动混入功能提交。
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
创建 `codex/phase-3-live-sideband` 分支；其独立 worktree 后续由继承 Phase 3/4 的
`/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit` 取代并退役，主 checkout
不承载本阶段修改。

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
仍保留给历史兼容测试和旧记录恢复；`yue-Hant-HK` 继续关闭。

Phase 4A 已在 Model Gateway 隔离分支 `codex/phase-4-response-observability` 完成并建立
stacked draft PR #10：`TokenUsage` 以向后兼容字段补齐缓存写入 token 与实际 Web Search
调用数，Responses 结果补齐最多 12 条经校验、去重的 HTTPS 来源；Gateway 全量 273 项测试
通过。Mural 的最低契约锁现在会拒绝缺少这些字段的旧 Gateway，并通过新契约。

Mural Responses adapter 已接入现有 `HostedHelpers` 预算、并发、超时与账本流水线：meaning、
assessment、普通推理和搜索分别解析为稳定逻辑模型，响应 ID 在落库前做不可逆摘要，供应商
响应正文和 ID 不进入日志；实际缓存/搜索用量和引用来源由 Gateway 返回，不从请求参数猜测。
配置了 Gateway 时 Live 与 Responses 一起走 Gateway；缺省路径仍保留显式的 OpenAI 短期
回滚实现。TypeScript check、跨仓库契约检查、39 项聚焦测试和无数据库全量 362 项测试通过，
PostgreSQL 全量及本分支 GitHub checks 已通过。

Phase 4 的共享 Gateway client 已补齐：启动时验证公开 `/healthz` 且不发送 Gateway
credential；Live 与 Responses 共用目标、鉴权和超时边界；连续三次 transport、timeout、
`429` 或 `5xx` 可用性故障后开路 15 秒，再只允许一个恢复探针。客户端主动取消不计入
故障，模型创建仍不做自动重试。新增聚焦测试后，无数据库全量 364 项中 92 项通过、
272 项按预期因缺少测试数据库跳过。

Phase 4B 的首个公开业务推理路径已落地：`POST /v1/model-tasks` 只接受有界业务数据和
显式 funding，不接受 prompt、schema、工具、供应商或模型名；服务端按
translation、assessment、teaching reply、topic search 生成固定教学策略和评估 schema，
再复用该会话已有的 helper 预算、幂等、防重和可信 Gateway 用量结算。评估请求携带
最多十轮有界上下文与待评 fragments，因为服务端当前按隐私设计不保存 transcript。
会话前的 “The world today” 搜索已增加独立 `account` AI-value funding：只对会员开放，
在一次 Gateway 请求前按保守上限建立账户预留，成功后仅按可信 usage 精确结算；未知结果
永久保留该次 hold，供应商越界保存不可变账务证据并停止后续准入，两者都不自动重试。
该路径不占用或冒充语音分钟，数据库不保存 query、prompt、输出、transcript、供应商模型名
或 credential；默认仍由 `ACCOUNT_MODEL_TASKS_EXPERIMENTAL=false` 关闭。

Phase 4 的无付费端到端路径也已通过：真实 Mural HTTP 路由、Bearer 鉴权、分钟账本、
Live/Helper 控制器和两个 Gateway adapter 连接本地 fake HTTP/WebSocket Gateway；验证
`mural.live.default` 与 `mural.translation.fast` 的路由、公开响应不泄露内部 session ID，
以及可信 usage 回写。加入独立账户级 topic search 后，PostgreSQL 17.11 全量 373 项测试
全部通过、0 跳过、0 失败；最新一次性实例仅监听 `127.0.0.1:55437`，测试后已停止并删除，
未调用付费模型。

PR #3 的 Android API 36 headless emulator 曾在无宿主或 guest OOM 的情况下退出。CI 保持
Android 36 compile SDK，但把设备测试固定到稳定的 API 35 default image，并将完整套件分成
四个全部必需的 shard；修正后的 Android build、4/4 emulator shards、Server、Swift Core、
Contracts 与 secret scan 均已通过，没有跳过界面覆盖。

2026-09-16 的 upstream 同步吸收了 International English 启动修复、安全错误引用和
Android preview 7。同步 PR #5 的 Android、emulator、Server、Swift Core、Contracts、
release-files 与 secret scan 全部通过；重基后的 Phase 4 继续同时保留公开 `en`/`zh-CN`
门禁、内部 `en-US` 历史 provider 兼容、账户级 model task 和不含敏感内容的启动诊断。
Phase 4 PR #4 的中断遗留 Gitleaks 命中已确认是测试幂等键误报，修订提交历史后本地
Gitleaks 8.30.1 与 GitHub secret scan 均通过；未发现或轮换任何真实密钥。

Phase 5 已从重基后的 Phase 4 顶部创建 `codex/phase-5-web-mvp` 隔离分支。工程实现已完成：

- `apps/web/` 使用 React、TypeScript 与 Vite，提供 `en` / `zh` 选择并保留禁用的
  `yue-Hant-HK` 产品身份；开发 Bearer 只保存在内存，刷新即清除。
- 浏览器可选择麦克风/扬声器、创建 WebRTC offer、经 Mural API 获取 answer、播放远端
  音轨、接收 DataChannel 字幕、发送有界文本并停止或重连。
- Mural API 新增显式 `MURAL_WEB_ALLOWED_ORIGINS`；只允许 HTTPS 或精确 loopback，
  preflight 仅开放所需 method/header，不启用 wildcard 或 cookie credential，并保留安全
  错误引用供浏览器报告。
- Google Web OAuth 使用独立 client ID、服务端 nonce 和 Mural token exchange；原生 iOS
  与 Android audience 保持兼容。开发 Bearer 仍只用于本地验证。
- topic search、translation、assessment、typed teaching reply、实时字幕和安全错误引用已
  接入公开业务 API；字幕按 Live delta 的到达顺序累积，不把 fragment 误判为完整 turn。
- PostgreSQL 成为会话文本与学习结果的权威数据源；写入按 provider event/idempotency key
  去重，账号删除清除内容，IndexedDB 仅保存按账号隔离的可丢弃列表缓存。
- Playwright 覆盖登录、WebRTC、字幕、文本教学、翻译与历史的单浏览器闭环；CI Web job
  安装固定 Chromium 并执行单测、构建和 E2E。
- `scripts/run-web-stack.sh` 一条命令复用现有 Model Gateway 隔离 worktree，启动独立
  PostgreSQL 数据库、8012 Gateway、8080 API 与 5173 Web，并生成 12 小时本地会员 token；
  不占用或修改其他项目正在使用的 8000 Gateway。
- 本机一键栈、健康检查、账号/分钟/capabilities/history 路径均已通过。受控真实调用已
  到达 Gateway/OpenAI，供应商因当前 API 账户余额为 0 返回 HTTP 429；系统未重试、未扣减
  600000 ms 分钟、未遗留 reservation，拒绝会话被安全关闭并记录不含敏感内容的诊断引用。
- 最终离线回归：Mural API/PostgreSQL 385 项、Swift Core 74 项、跨平台 Python 53 项、
  Web 单元测试 6 项和 Playwright E2E 1 项全部通过；Gitleaks 8.30.1 未发现密钥泄漏。

因此 Phase 5 当前为“代码完成、真实付费验收待额度”状态。补充最小 OpenAI API 额度后只需
重跑同一短时、无自动重试的 Live smoke，即可关闭最后一项外部验收门禁；在此之前 PR #6
继续保持 Draft，且不改变 PR #2/#3/#4 的 Draft 状态。
