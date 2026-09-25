# Phase 5.5B 架构与技术方案审查 — 2026-09-23

状态：2026-09-23 用户已采纳，纳入[统一开发基准](../web-ios-model-gateway-plan.md)；
实现与验收仍待分项完成。现有 staging 仍为「已部署、Gate 7 未通过」。

补充设计：[三端会话统一与多供应商扩展](2026-09-23-cross-client-multi-provider-design.md)，
进一步说明 Web/iOS/Android 的恢复规则，以及未来实时供应商扩展的计量、历史和运维边界。

## 审查基线与 upstream 同步

- 本次已成功 fetch `origin` 与只读 `upstream`。
- upstream/main：`631164d83a35214234cd08950f54b90936aa22da`，上游 PR #128，
  涉及字幕片段、流式释义、教学策略及最终用量恢复。
- origin/main：`d9cda0def1c5d633905ec8b79d7961370e925974`，下游 PR #37。
- `git rev-list --left-right --count origin/main...upstream/main` 为 `90 0`：
  下游已包含全部最新 upstream 提交，无待合并上游变更。
- 审查分支 `codex/phase-5-5b-architecture-review` 从上述 origin/main 创建。
  原工作分支保留；本次同步没有引入运行时代码变化，无需为同步另行部署。
- Worker 参考源码为独立 Gateway worktree 的 `9dfa761004b81e94941bd152e20cbfb924be13fd`；
  该 worktree 的 Worker 目录与其现有 `origin/main` 无差异。本次没有更新 Gateway 远端。
- 线上事实依据截至 9 月 23 日的部署、故障及验收记录。本次未重新检查 VPS 实时状态，
  未发起 Cloud 房间、模型调用、付费测试、密钥轮换或部署。

## 总体判断

采用 Web/iOS/Android → LiveKit → Worker → 实时模型的目标媒体链路，以及 Mural API → Gateway
的教学任务链路。Mural API 拥有账户、准入、账本和产品会话；Worker 拥有实时模型适配；
Gateway 拥有非实时模型路由。这个边界符合目前功能与延迟需求。

主要不足是故障后的状态协调、可靠交付和验证覆盖。先加强这些机制；现阶段没有足够证据
支持迁移实时供应商、替换 LiveKit、引入 Kubernetes 或增加通用消息中间件。

以下 P1 表示应优先处理的正确性问题；P2 表示有明确依据的下一阶段改进。
它们不是对过去已接受的 staging 例外的追溯撤销，也不把全部建议自动追加为 Gate 7 门槛。

## 1. P1：用户结算结束与外部资源清理结束必须分开

证据：`services/api/src/hosted-voice.ts:480` 的 tick 只扫描非 closed 会话。
lease 过期分支（498–502 行）忽略 `hangup` 失败，仍用最后可信用量调用最终结算；
`recordUsage` 随后写入 closed、清空 lease 并移除内存连接。

风险：Cloud DeleteRoom 不可用时，用户预留已释放，而房间/Worker 可能仍在运行。
后续 tick 不再扫描这个 closed 会话，单靠该路径不能保证继续清理。
Worker 的续租循环也只是记录失败并继续，没有按控制授权有效期自行停止模型的机制。
因此，旧 ADR 中“运营方未知差额最多约一个 30 秒 lease 窗口”的表述只在外部关闭可靠时成立，
不能作为所有故障下的费用上界。此风险未被证明是历史两条非最终用量记录的根因。

建议：

- 保留现有原则：用户按最后可信用量结算，未知差额不追加到用户账单。
- 增加独立的 `cleanup_pending/confirmed` 状态或数据库清理任务，账单 closed 后仍可重试。
- 只有 DeleteRoom 成功或精确 not_found，才确认资源清理；失败使用有界退避并告警。
- Worker 根据最后一次有效控制授权和会话上限，用单调时钟实施本地停止期限；API 不可达时
  能自行关闭实时模型。不要直接复用浏览器重连宽限：浏览器掉线时控制通道仍可能健康。
- 后到的最终 provider 用量进入运营对账记录，不再次扣用户款。

验收：模拟 DeleteRoom 503、API 不可达、Worker 仍存活、重复 tick、API 重启；证明用户
只结算一次，清理持续重试，控制授权过期后 Worker 有界停止。使用假的 provider 验证，无需付费。

## 2. P1：可信 control 返回成功前，应完成持久化

证据：`services/api/src/livekit/live-provider.ts:129` 的 usage/final 回调只调用
`listener.onUsage`；`HostedVoice.attach`（345–357 行）把写入排入内存 Promise 队列；
`app.ts:408` 随即返回 `{ accepted: true }`，没有等待该写入。
Worker `control.py:49` 把 2xx 当成功，`worker.py:224` 在退出时仅发送一次 final。

风险：API 已回应成功、数据库提交前进程退出，会遗失已确认事件。普通累计 usage 可能由
后续 heartbeat 补上；最后一条 final 没有这个保证。API 中的 listener Map 也不是持久收件箱。

建议：

- 短期让控制接口等待数据库事务或持久事件收件箱提交，再返回 accepted。
- 明确累计值、事件身份、重放和 final 的幂等语义；已完成会话重放相同 final 应返回一致结果。
- Worker 对可重试错误做有界重试；final 需要可恢复的待发送记录，不能只寄希望于退出钩子。
- 区分“最终用量已收到”“用户账单已结算”“供应商金额已对账”，避免一个布尔值承载三种含义。
- 不必马上引入 Kafka/Redis；优先复用 PostgreSQL 和小型持久待发送机制。

验收：API 在接收后/提交前退出、提交后/回包前退出、重复与乱序累计用量、final 超时、
迟到 final 均不得丢失确认或重复收费。SDK 的退出等待时间有限，必须在锁定版本下验证。

## 3. P1（Phase 6 接入前）：公开契约已偏离运行时

证据：`shared/contracts/mural-api.openapi.json:253` 要求创建请求包含
`transport: { type: webrtc, sdp }`，而 `services/api/src/app.ts:395` 会拒绝 `transport`，
当前接受的是顶层 `sdp`、language、history、requestedMilliseconds 等字段。
OpenAPI 响应只描述 webrtc，并要求运行时创建响应没有返回的 state。
Web 手写类型 `apps/web/src/api/contracts.ts:22` 已支持 livekit-room，尚未从这一契约生成。

建议：

- 先按当前已部署行为修正公开契约，保留历史客户端的兼容字段，不为了迎合旧文档破坏服务。
- 创建响应明确 webrtc/livekit-room 联合类型、预留/截止时间、错误语义及会话状态查询。
- 在 CI 中用真实 Fastify 注入请求/响应验证 schema，并覆盖错误响应；仅检查 fixture 或类型
  能编译不足以证明互通。
- 再逐步生成 Web/iOS/Android 的公开 API 类型或客户端。先共享协议和测试向量，不强求共享
  三端媒体实现语言。
- 审查时旧主设计文档写“Gateway 负责所有供应商”并列出 Gateway Live 接口，和已接受 ADR 的
  Worker 实时适配边界不一致。旧计划现已归档；Gateway contract lock 仍要求旧 Live schemas，应拆分当前
  Responses-only 消费契约与保留的历史诊断兼容契约。

验收：当前 Web 的无 SDP LiveKit 创建请求、旧 WebRTC 请求、状态/关闭及预留字段均通过
运行时契约测试；新 iOS 不需要靠猜测手写另一套类型。

## 4. P2：统一会话协调，区分信令、媒体和产品状态

证据：`apps/web/src/live/LiveConnection.ts` 里同时管理 SDK 重连、Room 重建、麦克风、
字幕、历史和关闭。SignalReconnecting 与 Reconnecting 都进入同一个恢复过程；5 秒后可能
销毁并重建 Room。Active 检查订阅和本地轨发布，但不等于已经验证上行音频抵达 Worker。
Stop 忽略 API close 错误，约 1 秒后回到 idle；Web API 封装也未消费已有 session status 接口。

建议：

- 提取产品会话协调器，网络重连仍交给 LiveKit SDK 优先处理；Room 重建作为有证据的后备。
- 分开维护产品生命周期、信令/媒体健康、历史同步状态。信令恢复时音频可能仍通，不应仅因
  信令事件和固定 5 秒计时就必然打断健康媒体。
- Active 依据控制授权、Worker 就绪、轨发布/订阅和媒体链路健康；结合 connection quality、
  WebRTC 统计或轻量 Agent 确认。安静/停顿不等于故障，不能以没有声音直接判 Failed。
- 建连/恢复/关闭时对照服务器状态；新 Room 加入前验证产品会话仍允许恢复。需要更新 token
  时由 API 发放，不能只凭内存中的旧创建结果无限重入。
- Stop 立即停止本机音频，另行显示服务端正在结束/结算；确认终态后刷新历史和余额。
- 用统一配置与不变量测试约束浏览器恢复、Agent 保留、控制 lease、房间超时，并分别说明
  “物理断网到检测”“检测到媒体恢复”。不再逐次追加更长超时来解释所有问题。

保留当前故障策略：同一 Worker/模型会话可恢复则续接；Worker 已丢失时结束当前会话，
由用户显式开始新会话。恢复新 Worker 所需的持久上下文和计费模型尚未设计完，不透明重建。

## 5. P2：历史记录应有服务端交付保证

证据：Web 仅在收到 final transcript 后调用持久化，`history-sync.ts` 只有 1/2/4 秒重试，
待写队列在页面内存中。Worker 已接收 `conversation_item_added`，但仅更新最近 10 条内存上下文。
当前字幕按字符串前缀追加；服务端事件冲突为 DO NOTHING，缺少修订语义。

用户反馈的“断网前一条不见”已在当时核实为列表预览只显示最后一条，不应改写为已证实丢数。
不过，当前交付方式确实不能保证浏览器长时间离线、刷新或未收到 final 后历史仍完整。

建议：Worker 提交可信最终轮次，API 按 session/turn/revision 幂等持久化，客户端用 cursor
补取；字幕增量用于即时展示，最终文本支持修订。文字输入使用独立 command ID 与确认状态，
避免历史写入失败阻塞发送，或把未送达文字显示成已完成轮次。
复用 upstream PR #128 的字幕片段/修订经验和跨端 fixtures。

历史正文属于受鉴权保护的产品数据；诊断仅保存事件类型、标识、计时与结果，不采集正文和音频。
不要把目前“可丢弃缓存”的 IndexedDB 悄悄变成唯一待发送存储而不修改其保留/退出清理规则。

## 6. P2：补真实 SDK 集成测试，减少付费人工排错

证据：`LiveConnection.test.ts` 完整替换 LiveKit Room；Web 的主要 Playwright 流程使用
假的 RTCPeerConnection 并返回旧 webrtc transport。现有测试能证明应用分支，但不能覆盖
真实 SDK 的事件顺序、full reconnect、轨重新发布和 Agent 保留行为。

建议新增一个非计费集成层：锁定版本的本地 LiveKit Server + 真实 JS SDK + 合成音频/假 Agent
或假模型 + 测试数据库。覆盖信令单独中断、媒体单独中断、Wi-Fi 等价断链、重连超过宽限、
关闭与重新连接竞争、麦克风重新发布、Agent 掉线、API 重启、删除房间失败以及历史 final 丢包。
模拟的数据链路应使用真实协议；最外层真实 Cloud + 模型只保留少量有预算的冒烟验收。

Worker 的供应商拒绝适配依赖 SDK 私有 `_opts`、`_create_ws_conn` 等细节，建议保持小范围封装，
锁定依赖并测试升级；不要扩大成第二套实时 SDK。

## 7. P2：将观测和发布校验变成常规能力

现有本地计时诊断是有用起点，但报告只在内存里；历史首音、打断和重连耗时无法事后补齐。
最近 14.366 秒首音样本中，initial-media-ready 为 8.455 秒，随后约 5.911 秒才检测到声音。
这只是在同一浏览器时钟上的分段，尚不能断言瓶颈属于模型、网络或 Worker 冷启动。

建议：

- 统一不含内容的会话事件：准入、建房、dispatch、Worker 就绪、模型连接、首音、重连、
  关闭请求、清理确认、用量 final。跨主机各算 span，通过会话标识关联，不直接相减未校准时钟。
- 将测试时窗内的 CPU/RSS、Cloud participant-minutes/流量、Mural 已扣时长、provider 成本
  并列记录；后者区分按费率估计和已确认账单，充值单独记账。
- 增加 cleanup_pending、控制续租失败、普通会话缺 final、长期未释放预留、Web-only 残留房间
  的可操作告警。先定义样本数量和验收阈值，再做少量付费采样。
- `deploy/phase-5-5b/verify.sh:31` 目前输出 Docker 状态，却不判断其是否 healthy；Worker 也
  无注册就绪断言。应对各组件状态、Worker 注册和目标镜像不匹配显式失败，避免只打印 PASS。
- 发布清单集中记录 API/Edge/Worker/Gateway 源版本与运行 digest、配置版本、迁移版本、
  备份校验和回滚目标。后续由 CI 构建发布固定制品，降低 VPS 现场构建和人工复制命令的风险。
- PostgreSQL、Node/Caddy 基础镜像当前仍使用标签；逐步固定 digest，并通过受控更新维持安全补丁。

## 8. P2：保持小规模部署，提前明确扩容边界

`HostedVoice.start` 使用 PostgreSQL 全局 advisory lock，内存保存会话 listeners/slots，
启动时优先关闭未结束会话。因此当前是单会话控制器进程设计，不能直接把 API 副本数加到 2
就称为高可用。应先提供 draining，再在并发证据需要时拆出会话控制职责、所有权及接管策略。

单 VPS 可继续支持受限英语 staging。扩大内测前，按每个活跃 Agent 的内存、首音与最大并发
实测配置准入上限，并留出数据库/API余量。优先按需要独立扩 Worker，暂不为单实例引入集群。

Compose 模板的 API 与迁移共用初始化数据库用户 `mural`；仓库已有 `mural_runtime` 授权脚本。
应核实线上实际角色，再将运行时与迁移/运维身份拆开，并测试最小权限。
这是模板证据，本次未直接查询线上角色，不能据此宣称已验证线上超级用户权限。
同时兑现已有长期运行前事项：私有/受限 SSH、独立 API/Worker LiveKit key、停用不再需要的 key、
异机备份与恢复演练。当前 host networking 已有回环绑定与外部探测，不宜在本轮为改网络模式
引入不必要的迁移风险；后续可审查内部网络与资源限制。

## 推荐实施顺序

| 批次 | 工作与目的 | 完成标准 |
| --- | --- | --- |
| A：继续故障验收前 | 先补 DeleteRoom 失败的持久清理与 Worker 自停，再补 control 持久确认；增加对应失败测试，强化部署状态断言 | 无付费故障用例通过，保留用户结算与 provider 清理的独立结果；按既有安全发布流程部署 |
| B：Gate 7 收尾 | 补结构化时窗指标、费用核对、有限英语样本；依据 LiveKit 回答处理真实拒绝测试/显式例外 | 原门槛有证据或明确例外，样本数与限制写明；超出原 15 分钟/$2 范围需另行授权 |
| C：扩大内测前 | 统一状态协调、可靠历史、真实 SDK 非计费集成层、draining、资源准入及必要运维加固 | 重复故障与重启可恢复，既有 upstream 功能不回退；单实例容量有测量依据 |
| D：Phase 6 接入前 | 在 B/C 期间并行修正公开契约和跨端 fixtures，再实现自有 iOS Client | 新 iOS 从已验证契约接入同一会话语义，不重新复制 Web 曾经出现的错误 |

普通话/粤语继续 coming later；本审查不重启其开发/付费测试。两个历史非最终用量案例保留
用户已接受的延期对账决定，不修改标志，也不因本次代码风险推断其原因。

## 本次验证与证据限制

- Web TypeScript 检查通过；8 个文件、37 项单元测试全部通过。
- API TypeScript 检查通过；7 项 LiveKit provider 测试全部通过。
- 两个无网络内存探针确认：final 已 accepted 时下游写入仍可 pending；DeleteRoom 异常后
  lease 分支仍执行结算，并在模拟 closed 的下一 tick 不再重试删除。后一个探针替换了数据库
  结算实现，只验证控制流，不能当作真实 PostgreSQL 或 Cloud 故障验收。
- 用 Ajv 校验当前 Web 创建请求形状，公开 OpenAPI 拒绝它：缺 transport，且不允许
  requestedMilliseconds；文档要求的 transport 又被当前 API allowlist 拒绝。
- 本次未运行 PostgreSQL 全量集成、iOS/Android、真实 LiveKit 网络故障或付费模型测试。
- 本报告仅新增审查文档；未修复上述问题、未提交远端 PR、未修改线上服务。

## 参考记录与官方语义

- [Gate 7 验收记录](../../verification/phase-5-5b/2026-09-22-gate-7-bounded-acceptance.md)
- [重连事件与部署记录](../../verification/phase-5-5b/2026-09-23-reconnect-incident.md)
- [英语计时记录](../../verification/phase-5-5b/2026-09-23-english-timing-diagnostic.md)
- [现有 LiveKit ADR](../adr/0001-livekit-gpt-live-spike.md)
- [LiveKit JS 2.22.3 RoomEvent](https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html)：
  SignalReconnecting 表示信令中断，媒体不一定中断；媒体同时失败会再触发 Reconnecting。
- [LiveKit 连接与恢复](https://docs.livekit.io/intro/basics/connect/)：full reconnect 的参与者/轨事件
  顺序；connection quality Lost 可用作较早的链路丢失信号。必须对照锁定 SDK 版本测试。
- [LiveKit 文本流](https://docs.livekit.io/transport/data/text-streams/#no-message-persistence)：
  文本流不提供长期持久化，需要应用自行保存；这支持可靠历史设计，不证明本项目历史已丢失。
- [LiveKit job 生命周期](https://docs.livekit.io/agents/server/job/)：退出钩子有时间预算，
  不应将无限重试放进关闭流程。实际预算须以锁定版本和运行配置为准。
