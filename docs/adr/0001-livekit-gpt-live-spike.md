# ADR 0001：以 LiveKit 承载 GPT-Live 客户端媒体链路

- 状态：Proposed — 等待真实 `gpt-live-1` 语音验收
- 日期：2026-09-16
- 范围：Phase 5.5，仅 OpenAI `gpt-live-1`

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
  加载；原 OpenAI/Gateway WebRTC 路径继续作为显式回滚方案。
- 浏览器只得到有房间范围和短有效期的 LiveKit token，不得到 OpenAI key、LiveKit
  API secret 或 Worker control token。

## 已验证

- LiveKit Server 1.13.7 可在本机启动；LiveKit Agents 1.8.2 worker 可注册为
  `mural-gpt-live`。
- Mural API 可创建 room、显式 dispatch Agent、签发短期参与者 token并删除 room。
- 可信 control 回调使用按会话 HMAC token，严格解析累计 usage 和 delegation 数据。
- 英语和普通话元数据、历史、字幕通道、`lk.chat` 文本输入、client delegation、主动停止
  及原 WebRTC 回滚路径均已接入代码和确定性测试。
- OpenAI key 仅存在于 Worker 环境；Web bundle 和 Mural API 响应不包含该 key。
- 真实零余额 smoke 已贯通浏览器、LiveKit Room、Agent Worker 并到达 OpenAI。OpenAI 在
  `session.started` 前返回 `credit_balance_exhausted`；Worker 将其作为可信 429 上报且不重试，
  Mural 以 0ms/0 成本关闭会话、释放全部 600000ms 预留，数据库无遗留 reservation。
- LiveKit Agents 1.8.2 尚未把上述错误视为致命拒绝，因此 Worker 以最小 adapter 仅转换
  明确的建连前认证/额度错误；依赖升级时必须重跑该回归。

## 尚未通过的门禁

- 账户余额仍为 0，因此尚未完成真实双向语音、自然打断、最终 provider usage 和结算。
- 需要在可用额度下记录首音延迟、打断延迟、断线恢复、CPU/内存和额外媒体带宽。
- Worker 丢失和会话中网络中断仍需确认不会遗留 reservation。

在上述门禁完成前，本 ADR 不把 LiveKit 提升为生产默认，也不删除旧 WebRTC 实现。

## 不在本决定内

Gemini Live、第二供应商、会话中切换、自动故障转移、LiveKit Cloud 与自托管生产选型均
留待独立阶段；本 spike 不用它们扩大公开协议。
