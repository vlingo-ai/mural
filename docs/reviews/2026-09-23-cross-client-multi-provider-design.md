# 三端会话统一与多供应商扩展方案 — 2026-09-23

状态：2026-09-23 用户已采纳，纳入[统一开发基准](../web-ios-model-gateway-plan.md)；
实施仍待分项完成。示例字段不是已发布 API；不启用第二供应商，不改变现有计费策略。
基线为 Mural `d9cda0d`，承接 [Phase 5.5B 架构审查](2026-09-23-phase-5-5b-architecture-review.md)。

## 1. 当前实现与需要统一的层次

| 客户端 | 当前主要实现 | 恢复方式 | 目标 |
| --- | --- | --- | --- |
| Web | LiveKit JS SDK；保留显式旧 WebRTC 路径 | SDK + 应用 Room 重建，40 秒应用恢复窗口 | 先作为新协议参考实现 |
| iOS | `App/LiveTransport.swift` 使用原生 WebRTC、SDP 和供应商事件 | ICE 状态 + 8 秒 `VoiceConnectionRecovery` | Phase 6 接入 LiveKit Swift SDK 与统一产品协议 |
| Android | `network/LiveTransport.kt` 使用原生 WebRTC；已有 hosted lease ownership 抽象 | WebRTC 状态 + 8 秒恢复等待 | 后续接入 LiveKit Android SDK，复用相同协议与 fixtures |

本次检查未在两个原生客户端中发现已接入的 LiveKit 实现。不能把 Web 的成功重连算作原生端验收。
统一目标是相同的产品语义、恢复边界和可验证行为；不要求 TypeScript/Swift/Kotlin 共享同一个
运行时，也不把某个平台的网络事件名称或 40 秒常量机械复制到另外两端。

### 1.1 四层职责

1. **Mural 会话协议**：API 拥有账户、准入、会话 ID、恢复许可、预算、关闭、结算和历史游标。
2. **客户端会话协调器**：三端实现相同状态规则、单次操作所有权和服务端状态协调。
3. **LiveKit 传输适配器**：各端使用官方 SDK，统一映射 SDK 事件，优先使用 SDK 的连接恢复。
4. **设备适配器**：Web 的权限/自动播放/页面挂起，iOS 的 AVAudioSession/来电/后台，Android
   的音频焦点/设备切换/前后台服务分别实现，不伪装成完全相同的操作系统行为。

Android 已有 `LiveSessionOwnership` 处理“创建结果晚于本地取消”的竞态，可以提炼为共享
测试规则；iOS 也有 attempt 标识与清理测试。迁移应保留这些已有能力，而非整段重写。

### 1.2 产品状态与多维健康状态

建议共同的产品生命周期为：

```text
idle → starting → active ⇄ recovering → closing → closed
                 └───────────────→ failed
```

同时独立保留：`transportState`、`mediaState`、`historySyncState`、`settlementState`。
failed 表示会话体验失败，不能代表清理和结算已完成；用户停止播放后，结算仍可能 pending。

关键不变量：

- 重连继续使用同一个 Mural session；不能因为浏览器或手机网络恢复而再次创建付费模型会话。
- Active 需满足服务端仍许可、Worker 已就绪以及适用的媒体条件；轨存在不等于链路必然正常。
- 用户主动静音、模型思考或正常停顿不能被误判为断线；播放被系统阻止应有单独提示。
- Stop 立即释放本机媒体，同时幂等请求服务端关闭；收到服务端终态后刷新余额与历史。
- 老连接/老 attempt 的事件不得更改新连接状态。SDK generation 与服务端所有权版本分别校验。
- 应用从休眠、后台或系统终止后恢复，先查询服务端状态，再决定恢复或展示已结束；不能依赖
  后台仍能精确运行的客户端计时器来限制费用。
- 同一会话默认只有一个获准控制的客户端；第二设备应拒绝或走明确接管流程，不能隐式竞争麦克风。

### 1.3 建议的公开协议扩展

先修正现有 OpenAPI 与运行时差异，再以兼容方式增加以下能力；名称为提案，非已发布接口：

- 创建结果：现有 sessionID/transport/deadline，加 `protocolVersion`、`recoveryPolicyVersion`、
  `clientGeneration`、有效功能集合及恢复截止信息。供应商凭证、恢复 handle 不返回客户端。
- 现有 status/current 接口：增加明确的运行/关闭原因、恢复许可、结算状态和历史 cursor。
- 恢复/接管接口：在认证、会话状态、预算、Worker 有效性检查后，发放必要的短期入房凭据和
  新客户端所有权版本。SDK 对同一有效连接的普通 resume 不必每次再调用创建接口。
- 开始、停止、文字输入使用稳定 command ID；同一请求重试不创建重复会话或重复执行工具。
- 先在 recovering/closing/回前台阶段利用已有 HTTP 状态查询；确有需要时再增加可断线补取的
  服务端事件流，不为统一协议先引入另一套 WebSocket 基础设施。

恢复策略由服务端选择、随会话固定版本。三端共享上限与决策规则；网络检测延迟和操作系统
限制分别记录。服务端截止时间与客户端单调计时配合，回前台重新同步，不跨主机直接相减时钟。

### 1.4 共同测试协议

在 `shared/fixtures/` 增加纯 JSON 的事件轨迹和预期状态/副作用，TS、Swift、Kotlin 用各自
测试框架执行同一组数据。公开 API 类型优先生成，协调器的纯状态 reducer 可分别实现。
不先引入跨语言 FFI 或改造为另一种跨平台 UI 框架。

必须覆盖：信令断/媒体仍通、媒体断/信令仍通、短断网恢复、超时、麦克风重新发布、Agent
离线、Stop 与恢复竞争、创建结果迟到、来电/音频焦点丢失、后台恢复、重复事件和第二设备。
这些确定性测试之外，每个平台还要使用真实 LiveKit SDK、真实设备音频路径做独立验证。
模拟器测试不能替代 iPhone/Android 真机的来电、蓝牙、后台和 Wi-Fi/蜂窝切换验收。

## 2. 多供应商意味着要处理三段独立连接

| 连接 | 恢复责任 | 谁批准是否还能继续 |
| --- | --- | --- |
| 客户端 ↔ LiveKit | 客户端 SDK 与会话协调器 | Mural 会话状态、所有权与预算 |
| Worker ↔ 模型供应商 | 对应 LiveKit plugin 与我们的最小适配层 | 该供应商恢复能力、模型执行状态及 Mural 许可 |
| Worker ↔ Mural 控制通道 | 持久确认、重试和控制 lease | API 发放的有效期；过期时 Worker 本地停止 |

浏览器的网络恢复成功，并不证明模型连接正常；模型连接恢复也不能掩盖控制授权已失效。
这三段必须分别记录状态和耗时，再决定呈现给用户的 active/recovering/failed。

LiveKit 支持多个实时模型插件，减少了媒体接口差异，但不同模型的轮次、打断、工具调用、
转写、上下文恢复和计费并不完全相同。官方当前文档也明确：活动 Agent 的 RealtimeModel
不能直接替换为另一模型；需要新的 Agent/handoff。能接入多模型不等于现有会话可以任意无缝迁移。

## 3. 当前 GPT-Live 耦合点

- Worker `worker.py:167` 固定 `gpt-live-1`、voice 和 client delegation；私有 SDK 拒绝适配
  与 `append_commentary` 也属于这一供应商实现。
- Worker `usage.py:8` 只统计 model 为 `gpt-live-1` 的 session_duration。
- API `VoiceUsage` 与 `VoiceMeter` 只接受 seconds；`pricing.ts` 以统一固定时长费率算 voice 成本。
- `HostedVoice.recordUsage` 要求记录的 rate_version 等于当前全局 RATE_VERSION，不适合
  同时存在多种模型/费率版本的执行。
- LiveKit 实现把 room 名写入通用 provider_session_id；未来需要区分 room 与真正模型会话标识。
- GPT delegation → Mural → Gateway 的回调不能原样当作所有实时供应商的通用协议。

直接替换 Worker 的模型构造函数，会留下用量为零、错误估价或教学工具路径不一致的风险。

## 4. 推荐的服务边界与模型选择

| 组件 | 统一职责 | 供应商相关部分 |
| --- | --- | --- |
| Web/iOS/Android | 产品会话、LiveKit 媒体、字幕和工具展示 | 读取经 API 筛选的功能，不持有供应商 SDK/密钥 |
| Mural API | 产品套餐/语言权限、选择已批准 route、准入预留、会话、账本、历史与清理 | 根据版本化能力与费率快照决定可用范围，不硬编码供应商错误解析 |
| Agent Worker | Agent 生命周期、媒体、可信事件与本地截止 | 通过 adapter 构造相应 LiveKit plugin，归一化事件/用量/恢复行为 |
| Model Gateway | 非实时模型任务、供应商适配规范及版本化模型目录 | Responses/翻译/评估等路由；Worker 可与其同仓管理但独立运行 |
| PostgreSQL | 会话、执行段、事件确认、账本和产品历史的持久依据 | 保留供应商来源/执行信息，不由供应商事件直接改写产品权限 |

客户端只请求逻辑 profile，例如 `speaking.standard`，不任意指定原始 model 名和价格。
Gateway 仓库维护版本化模型目录/schema；API 根据产品规则、Worker 就绪、地区限制和预算
从批准的 route 中选定一条。Worker 验证并执行该 route，不再独立选择另一个供应商。

初期使用发布时固定的目录制品，避免 API、Worker 各维护一份独立路由真相，也不要求每次
建房多一次同步 Gateway 查询。新会话固定 route/model/能力/提示词/价格版本；路由更新不
静默改变进行中的会话。目录支持与实际账户可用性、Worker 就绪、人工质量验收是不同条件。

音频继续沿 客户端 → LiveKit → Worker → 供应商。Gateway 不必再代理一次实时音频。
它统一模型配置与非实时执行的职责，和 Worker 直接调用供应商并不冲突。

### 4.1 小型 adapter 与能力描述

建议在 Worker 内定义最小适配面（不是再实现一套 SDK）：

```text
describeCapabilities()
buildAgentModel(approvedRoute, credentialRef, sessionPolicy)
normalizeUsage(pluginEvent, executionContext)
normalizeConversationItem(pluginEvent)
normalizeFailure(pluginError, startupStage)
resumePolicy()
```

能力描述至少覆盖支持语言、输入/输出模态、文字输入、转写及修订、打断模式、工具调用、
上下文注入、是否支持同一模型会话恢复、用量类型与可信程度。
可用功能取“客户端支持 ∩ 产品已开放 ∩ route 支持 ∩ 运行就绪 ∩ 已通过质量验收”。
未知能力不假定为支持；缺失用量不写成 0。英语之外的功能仍按当前 coming later 范围关闭。

认证失败、配额拒绝、瞬时错误、连接结果不确定、用量缺失、能力不支持应归一化为稳定错误。
“能否重试”与“能否认定零成本并释放预留”必须是两个独立判断，不能简单把所有 4xx 等价处理。

## 5. 三类账必须分开

1. **用户权益/收费**：分钟包或明确报价的产品计费政策，按会话创建时的版本执行。
2. **模型供应商用量与成本**：按执行段记录时长、音频/文字输入输出 token、缓存等维度，
   使用对应的供应商/model/接入渠道/地区/币种/费率版本计算。
3. **LiveKit 与基础设施成本**：参与者分钟、网络流量、Worker 资源等，用于运营核算。

Gemini Live 官方当前说明为 token 计费，不能套用本项目现有的固定按时长 voice 成本公式。
本文不选定 Gemini 型号或报价；真正接入时还需核对具体模型和 Gemini API/Vertex 等接入渠道。

建议用兼容新增表/字段实现，而不是重写原账本：

| 数据对象 | 最小作用 |
| --- | --- |
| hosted session | 用户会话、产品政策、权益预留、关闭/结算状态 |
| model execution | 一次已获准的模型执行，关联供应商、model、route、Worker、费率快照与独立终态 |
| usage event | event ID、execution ID、计量 epoch/范围、seq、delta/cumulative、单位、来源和 final 状态 |
| provider reconciliation | 已估成本、最终用量、已匹配账单及差异；迟到值不直接重扣用户 |
| cleanup task | room/执行清理与重试，不受用户账单已结算影响 |

产品 session 可以关联多个 execution，但当前阶段仍限定只启用 GPT-Live 单一执行路径。
客户端连接 generation 与模型 execution 分别编号；普通客户端重连不增加模型执行段。
供应商原连接恢复时，如用量计数器重置，应建立新计量 epoch，不能当作累计值倒退或重复相加。
事件必须声明累计值的范围（请求/模型会话/执行），重放按此去重。

分钟产品的用户计费与供应商 token 成本独立。未来若选择按产品有效连接时间扣分钟，必须
发布新政策、明确断线宽限和后台时间是否计入；当前已保存会话仍执行原政策，不能静默改账。
存在多个执行段或短暂重叠时，用户时间按产品有效区间计算，供应商成本按各执行实际用量累加。

金额使用整数最小单位/明确舍入规则，费率快照不随全局常量升级改变旧会话。分钟余额不是
token 供应商的硬费用上限；还需要模型执行预算、上下文/输出限制、用量更新延迟余量和
Worker 截止策略。未知费率或未知最终成本需保持显式待核对状态，不认定免费。

接入渠道也要记录：供应商直付、Vertex 或未来的 LiveKit Inference 可能有不同账单来源。
避免把同一笔模型推理既算进 LiveKit 发票又算进供应商直付；媒体费用仍单列。

## 6. 教学任务、历史与供应商切换

GPT 的 client delegation 由 adapter 映射为通用教学任务；其他模型的 function tools 也映射
到同一套 Mural 业务命令，再调用 Gateway。请求包含业务 task ID、会话/执行关联及策略版本。
同一任务重试用相同幂等键；不能因换模型就重复执行、重复扣费或绕过搜索次数限制。
实时模型的普通语音回复仍由实时模型生成，不把每个音频片段改道教学 Gateway。

历史采用供应商无关的 turn/fragment ID、speaker、文本修订、顺序和执行来源，Worker 可靠
提交最终轮次，客户端用 cursor 补取。缺失转写应显式标记；模型生成了文字、播放了部分音频、
用户实际听到完整句子并不等价，被打断的尾部不能一律当作已说完的历史。
产品历史正文保持鉴权与保留策略，计量/诊断事件不得夹带正文、音频、密钥或恢复 handle。

切换分阶段实现：

- **第一阶段**：会话开始时选定供应商，本会话保持固定；失败仍按现有安全策略结束。
- **第二阶段**：明确未启动/已结束的执行可按预定政策尝试备选；结果不确定时先核实清理或
  管理额外费用敞口，不能盲目再开一个模型会话。
- **第三阶段**：需要会话中 handoff 时，建立新 execution，确认旧执行停止，转移经批准的
  文本上下文/教学状态，处理声音变化和重复工具；此能力须单独验收。

文本历史能恢复学习语境，不代表能迁移供应商内部音频、韵律、隐状态或未完成生成。
Gemini 的 session resumption 是同供应商会话恢复机制，也不等价于 GPT → Gemini 的迁移。
其 resume handle 应当作为受保护的服务端状态，按必要范围和有效期保存，不传给客户端或日志。

## 7. 运维与发布

- 使用统一事件格式，按平台、route/provider/model、plugin 版本及故障阶段比较成功率、首音、
  打断、恢复、用量 final 延迟和成本差异。计时区分客户端链路与供应商链路。
- 会话/执行 ID 用于受控日志和追踪；不要把每个 ID 放进聚合指标标签造成无限基数。
- 实时模型密钥按供应商、环境、工作负载独立管理；插件依赖冲突或隔离需求出现时拆 Worker
  池，而不是让每个 Worker 都持有所有供应商密钥。
- 发布清单包含 API 协议版本、Worker adapter/plugin、route/能力/价格/提示词版本和镜像 digest。
  不兼容组合应在准入/部署时被拒绝，回滚保留旧执行的解析与计量能力。
- 供应商级熔断和并发上限由服务端治理。SDK 自带 fallback 不得绕过 Mural 的预算、已批准
  路由和数据地域政策；不要把 STT/LLM/TTS fallback 文档当成所有实时会话都可无缝迁移的保证。

## 8. 推荐实施顺序与新增供应商完成条件

1. 先完成原报告的持久关闭/清理、control 确认和运行时契约修复；把三端恢复规则写成 shared
   fixtures。这些直接服务当前 GPT-Live 英语路径。
2. 增加产品 session 与模型 execution 的边界、版本化 route 和多维用量 schema；先让当前
   GPT-Live adapter 在新边界内保持现有行为，再用假供应商验证另一种计量与错误语义。
3. Web 作为协议参考；Phase 6 iOS 接入相同协议和 Swift SDK；Android 后续接入，同样通过
   fixtures 和本端集成测试。保留 upstream 的历史客户端兼容路径，不进行静默迁移。
4. 真正接 Gemini 时再确定模型、接入渠道、密钥/地区/费率和预算，以新会话选路做小范围验证。
   第二供应商上线之前必须通过成本、权限、工具、历史、重连和关闭全部适配验收。
5. 活动会话跨供应商 handoff、自动成本路由和多 Worker 接管留到基本多供应商会话运行稳定后。

新增供应商的完成条件不是“可以出声”：还需功能差异明确、工具幂等、用量完整可对账、
断线有界、清理可靠、正文/密钥不进入诊断、三端无需新增供应商专用逻辑，且所有能力均经过
实际部署组合验证。单一用户分钟报价可以保持统一，运营成本必须按真实供应商分别核算。

## 官方资料与本次工作边界

- [LiveKit 实时模型](https://docs.livekit.io/agents/models/realtime/)：支持多个实时模型插件，
  能力与转写/上下文行为存在差异。
- [LiveKit Gemini 插件](https://docs.livekit.io/agents/models/realtime/plugins/gemini/)：模型实例、
  接入渠道认证和轮次配置。
- [LiveKit Agent handoff](https://docs.livekit.io/agents/logic/agents-handoffs/)：活动 realtime
  模型不能直接替换，模型变更需使用新 Agent/handoff。
- [LiveKit fallback](https://docs.livekit.io/agents/logic/fallback-strategies/)：各类 fallback 的适用范围。
- [Gemini Live 会话恢复](https://ai.google.dev/gemini-api/docs/live-api/session-management)：同供应商
  session resumption 与恢复 handle。
- [Gemini Live 计费说明](https://ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing)：
  按 token 用量计费，实际模型/渠道费率需在实施时另行核实。

本次仅阅读源码与官方资料并补充设计文档；未改动运行时代码、价格、账户权限或供应商配置，
未运行付费验证。上一份报告中的测试结果仍只是当时基线的验证，不能作为本提案已实现的证据。
