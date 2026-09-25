# ADR 0001：以 LiveKit 承载 GPT-Live 客户端媒体链路

- 状态：Accepted — Phase 5.5A 本机功能与可靠性门禁通过
- 日期：2026-09-17
- 范围：Phase 5.5，仅 OpenAI `gpt-live-1`

2026-09-23 续订：本 ADR 保留 5.5A 的历史证据；后续实施遵循
[统一开发基准](../web-ios-model-gateway-plan.md)及已采纳的三端/多供应商设计。
目前只有 Web 已接入 LiveKit staging；iOS/Android 尚待迁移，Gate 7 未验收通过。
本轮英语单语推进；以下普通话测试仅为既往证据，不要求继续同步开发或测试。

## 产品命名约束

本仓库继续保留 Mural 上游身份、Git 历史和既有内部兼容标识；对外产品名为
**vLingo Speaking Live**，基础设施 slug 为 `vlingo-speaking-live`，域名命名空间为
`vlingo.ai`。从 Phase 5.5B 起，新建 LiveKit project、域名、部署资源和监控标签直接使用
正式产品命名，避免在 Phase 5.5C 内测前迁移不可更名资源。

本决定不授权机械替换代码、数据库迁移、协议字段或历史 archive 中的 `mural`。这些标识
只有在具备独立迁移、兼容测试和可控 upstream 合并成本时才更名；Mural 的 MIT 许可、版权
和 attribution 始终保留。

## 背景

Mural 现有 Web 路径由浏览器通过 WebRTC 直连 OpenAI，Mural API 负责鉴权、分钟预留、
教学任务和结算，Model Gateway 负责模型路由。为了让 Web 与 iOS 共用同一种实时媒体
实现，并为未来供应商适配保留后端边界，本 spike 验证 LiveKit 是否能替代客户端的
供应商专用连接代码。

OpenAI 官方把 LiveKit 列为 GPT-Live partner integration。LiveKit 客户端仍使用 WebRTC，
音频不会经过 Mural API；可信 Agent Worker 通过 LiveKit OpenAI 插件连接 `gpt-live-1`。

## 候选决定

若真实验收通过，Phase 6 默认采用以下链路：

```text
Web / iOS ── WebRTC ── LiveKit Room ── Agent Worker ── gpt-live-1
    │                         │                 │
    └──── HTTPS ─────── Mural API ─────── Model Gateway（教学 Responses）
```

- Mural API 是账户、额度、短期 room token、会话生命周期和最终结算的权威。
- Agent Worker 位于 Model Gateway 仓库的独立 Python 子项目，使用独立 lockfile；它不与
  Model Gateway 主进程共享不兼容的 OpenAI SDK 主版本。
- GPT-Live 使用 `delegation=client`。教学推理回调 Mural，再沿既有 Model Gateway
  Responses 路径执行，不绕过统一模型网关。
- Web 先读取 Mural capability，再选择 `livekit-room` 或旧 `webrtc`。LiveKit SDK 按需
  加载；旧 OpenAI WebRTC 保留为显式本地诊断/兼容路径，不是已验收的 staging 回滚。
  Gateway 的实时原型适配已移除，不恢复 Gateway Live 作为默认链路。
- 浏览器只得到有房间范围和短有效期的 LiveKit token，不得到 OpenAI key、LiveKit
  API secret 或 Worker control token。
- 产品级 Live capability 由 Mural 聚合，实时 provider/model 的就绪状态由 Agent Worker
  提供；Model Gateway 不新增 Live capability 或 `GATEWAY_LIVE_BACKEND`。它只承担
  client delegation 所需的 Responses 路由以及独立 ASR/Alignment 等非实时能力。

## 已验证

- LiveKit Server 1.13.7 可在本机启动；LiveKit Agents 1.8.2 worker 可注册为
  `mural-gpt-live`。
- Mural API 可创建 room、显式 dispatch Agent、签发短期参与者 token并删除 room。
- 可信 control 回调使用按会话 HMAC token，严格解析累计 usage 和 delegation 数据。
- 英语和普通话元数据、历史、字幕通道、`lk.chat` 文本输入、client delegation、主动停止
  及原 WebRTC 回滚路径均已接入代码和确定性测试。
- 实时 OpenAI key 仅存在于 Worker 环境；Gateway 另持独立教学推理 key。
  Web bundle 和 Mural API staging 环境/响应不包含这两把 key。
- 真实零余额 smoke 已贯通浏览器、LiveKit Room、Agent Worker 并到达 OpenAI。OpenAI 在
  `session.started` 前返回 `credit_balance_exhausted`；Worker 将其作为可信 429 上报且不重试，
  Mural 以 0ms/0 成本关闭会话、释放全部 600000ms 预留，数据库无遗留 reservation。
- LiveKit Agents 1.8.2 尚未把上述错误视为致命拒绝，因此 Worker 以最小 adapter 仅转换
  明确的建连前认证/额度错误；依赖升级时必须重跑该回归。
- 有余额的真实 smoke 已收到 OpenAI `session.started`，Web 与 Agent 均加入同一本地
  LiveKit room，音频轨发布/订阅成功且连接质量为 Excellent。Web 现在以远端音频轨
  订阅作为 Active 信号，不再错误依赖可选的转写事件并在 20 秒后超时。
- 用户主动停止后，会话以 `closed/user_requested` 结束，600000ms 预留按最低
  15000ms 结算，`minute_reservations.state=settled` 且钱包 `reserved_ms=0`。并发关闭
  路径遇到 LiveKit 精确 `not_found/404` 时按幂等成功处理，不再误标
  `sideband_lost`。
- 英语真实麦克风完成两轮双向语音、字幕与远端播放，观察/扣除 21000ms；普通话会话中，
  用户听到回复、插话终止旧回复并得到新问题答案，最终观察/扣除 126000ms，两个会话均
  正常释放 reservation。
- 浏览器主动离开会触发 Worker 正常 shutdown callback，最终累计 usage 可被可信上报并结算。
- 本机单会话抽样：LiveKit Server 约 91MB RSS、Worker 主进程约 82MB、活跃 Agent 子进程
  约 346MB，浏览器上行语音约 77kbps。它只用于发现数量级，不代表生产容量或 Cloud 成本。
- Agent 每 5 秒通过会话 HMAC 控制通道提交最新累计 usage 并续期 30 秒 Worker lease。
  SIGKILL Agent 子进程的真实回归中，Web 自动变为 Failed；Mural 在 lease 到期后删除 room，
  按最后可信 31000ms 结算，释放全部 reservation，钱包 `reserved_ms=0`。会话记录
  `close_reason=worker_lease_expired`、`provider_usage_final=false`，供运营方对账。
- 暂停并恢复同一 LiveKit Server 进程模拟短时网络丢包后，Web 与 Agent 经 LiveKit resume
  流程恢复。恢复后 `lk.chat` 消息得到 GPT-Live 回复，会话保持 Active；主动关闭最终观察/
  扣除 71000ms，`provider_usage_final=true`、钱包 `reserved_ms=0`。

## 已接受的故障策略与后续限制

- LiveKit 本机测试仍未在 Agent job 硬崩溃后自动启动替代 job；当前策略是结束故障会话，
  不在缺少可持久恢复上下文时透明创建第二个 OpenAI 会话。
- lease 异常结算只把最后可信累计 usage 计入用户账单；最后 heartbeat 到供应商实际终止之间
  的未知差额由运营方承担并对账，不转嫁给用户。**30 秒不是所有故障下的费用上界**：
  DeleteRoom 失败时可能继续运行。持久清理重试及 Worker 控制授权本地截止已在 B1
  实现并于 2026-09-25 部署至英语 staging；故障路径是非计费测试证据，真实 Cloud 故障注入仍未执行，
  参见 [B1 部署记录](../../verification/2026-09-24-b1-resource-cleanup.md)。
- Phase 5.5A 只证明本机自托管拓扑。LiveKit Cloud Build、跨区域网络、滚动发布、并发容量、
  告警和产品内测仍按 Phase 5.5B/5.5C 验证；未通过前不删除旧 WebRTC 回滚路径。

本 ADR 接受 Web/iOS 共享 LiveKit 客户端与可信 Worker lease 的方向；它不等于生产发布批准。

## 部署验证顺序

本 ADR 的当前门禁只要求先以最简单的本机自托管方式跑通 LiveKit：LiveKit Server、
Agent Worker、Mural API、Web 和必要的 Model Gateway 服务均可运行在开发机。它验证的是
Mural 功能和信任边界，不代表生产部署决定。

本机门禁通过后，按以下顺序推进混合部署：

1. **LiveKit Cloud Build 验证**：使用独立项目 `vlingo-speaking-live-staging`；LiveKit Cloud
   承载房间、信令和媒体；Mural API、
   Model Gateway 与 Agent Worker 自托管。重跑双向语音、打断、结算、断线恢复与密钥
   隔离门禁，并记录 participant-minutes、下行流量和延迟。
2. **受控产品内测**：保持相同拓扑，先验收 Web，再按 Phase 6 接入 iOS、后续 Android。
   加入用户白名单、并发/预算、告警、kill switch 和恢复能力；套餐升级须按实测需求单独批准，
   不以本 ADR 自动购买 Ship，也不在没有控制所有权方案时直接扩 API 副本。

上述两步均使用 Mural 运营方保存在 Agent Worker 服务端的 OpenAI API key。Mural 注册
用户只取得短期 LiveKit room token，不需要每次输入自备 key。LiveKit Cloud 账单与
OpenAI API 账单彼此独立。

Build 和 Ship 默认使用 LiveKit 自动路由，不启用 Region Pinning。只有合同、监管或
数据驻留要求必须把 LiveKit 信令和媒体限制在指定区域时，才单独评审 Scale 及以上方案；
Region Pinning 不控制 Worker、OpenAI、数据库、录音或日志的地域，且会牺牲跨区域自动
故障转移能力。

## 不在本决定内

后续已采纳最小多供应商扩展基础（execution、版本化 route/用量/价格），先服务 GPT/英语并用假供应商验证。
Gemini 等真实第二供应商、会话中 handoff、自动故障转移、Scale/Region Pinning 和完全自托管
生产选型仍为独立后续范围；不因设计接受而启用、购买或宣称无缝切换。
