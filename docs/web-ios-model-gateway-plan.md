# vLingo Speaking Live：项目开发基准

初版：2026-09-23；更新：2026-09-25（后续镜像构建与发布方式）；状态：用户已采纳，作为后续开发、文档和验收的统一基准。
**设计已接受不等于功能已实现；当前 Phase 5.5B 已部署，Gate 7 尚未验收通过。**

本文件取代[旧总计划](archive/2026-09-23-superseded-development-plan.md)。详细设计为
[架构审查](reviews/2026-09-23-phase-5-5b-architecture-review.md)和
[三端统一与多供应商方案](reviews/2026-09-23-cross-client-multi-provider-design.md)，二者已获采纳。
源码审查基线为 Mural `d9cda0d`；已包含 upstream `631164d`，没有待合并的上游提交。
实际部署版本以[分次部署与验收证据](../verification/phase-5-5b/README.md)为准，不能用本地 HEAD 代替。

## 1. 文档权威与产品范围

1. 本文件决定阶段顺序、范围及完成条件；详细架构文档解释设计，runbook 规定发布安全步骤。
2. 运行时事实以源码、契约测试及指定版本的部署证据为准。不通过改文档宣称待实现功能已完成。
3. 带日期的验证、商店草稿、upstream 发布记录只代表当时版本，不覆盖本基准；历史记录不追改结论。
4. 范围变化须更新本基准、相关三端文档及验收项。[文档索引](documentation-index.md)列出更新、保留和归档范围。
5. 用户于 2026-09-24 将[发布上线测试与验证方案](operations/release-verification-plan.md)指定为项目最高优先级的必维护文档之一。每轮开发测试验证后必须更新其迭代归集表、关联分次证据并沉淀规则/自动化改进；没有新规则也须明确记录。完成此闭环才可报告迭代完成。产品范围仍由本基准决定，不能借维护文档扩大部署或付费授权。

对外名称为 **vLingo Speaking Live**，资源 slug 为 `vlingo-speaking-live`，域名为 `vlingo.ai`。
保留 Mural 的 MIT 许可、版权、attribution、数据库和协议兼容标识。
`mural.chat`、upstream Google Cloud 项目、原作者商店账号/证书均不是本 fork 的资产。

当前仅推进**英语**。Web 普通话和粤语标记 **coming later**，粤语显示名不含“香港”；
`zh` / `zh-CN` 和 `yue` / `yue-Hant-HK` 存储身份不改。普通话开发与测试暂停，粤语尚未开放。
API 和现有原生端的普通话兼容及历史解码保留；这不是已在三端实施的 API 全局禁用。
重新开放语言须另行批准、定义质量指标并验收，不能因供应商支持该语言就自动开启。

## 2. 当前实现与目标边界

| 部分 | 当前事实 | 已采纳目标，尚待相应实现 |
| --- | --- | --- |
| Web | LiveKit JS SDK，已做英语 staging 验证；保留显式旧 WebRTC 诊断路径 | 统一会话协议的首个参考客户端 |
| iOS | 原生 WebRTC/SDP、设备本地学习存储 | Phase 6 使用 LiveKit Swift SDK、自有 App/OAuth 身份及统一协议 |
| Android | 原生 WebRTC、账户/托管所有权与账本集成 | 后续使用 LiveKit Android SDK，保留已有竞态及兼容处理 |
| Mural API | 产品鉴权、准入、会话、历史及账本 | 持久控制确认/清理、协议修复、执行与用量归一化 |
| Worker | 独立 Python 项目，GPT-Live 插件及专用适配 | 最小 provider adapter、控制授权本地截止、可靠 final/history 交付 |
| Model Gateway | 教学 Responses；staging 独立 ASR/Alignment 关闭 | 版本化模型目录、非实时路由；不重新承接实时音频代理 |

目标链路：

```text
Web / iOS / Android ── 媒体 ── LiveKit ── Worker ── 实时供应商
        │                                 │
        └── 产品 HTTPS ── Mural API ◀── 可信控制/用量/教学工具
                              │
                              ├── PostgreSQL：会话、历史、账本
                              └── Model Gateway：非实时教学推理
```

这不是原生端已接入 LiveKit 的声明。API 决定用户能否使用 route；Gateway 仓库维护模型目录；
Worker 执行随会话固定的 route。版本化目录/选路治理仍需实现。
客户端不得接触供应商密钥、Worker 控制凭据或直接选择未授权模型。
旧 OpenAI WebRTC 仅为显式本地诊断/兼容路径，不是已验证的 staging 自动回滚或故障转移。
Gateway Live 原型适配已移除，但旧接口/schema/contract lock 仍有残留；清理它们是代码任务。

## 3. 三端会话与恢复的共同不变量

- 统一产品状态、API/schema 与纯 JSON 事件轨迹；TypeScript、Swift、Kotlin 分别实现协调器和平台设备适配，不先引入跨语言运行时。
- 生命周期与 transport、media、history sync、settlement 分开。Active 不是仅凭页面在线或存在音轨；正常沉默、静音、模型思考也不是失败。
- 分别处理客户端↔LiveKit、Worker↔供应商、Worker↔Mural 控制三段连接；一段恢复不代表全链路恢复。
- 优先 SDK 恢复；应用重建 Room 仅作受控兜底。保持同一产品 session，禁止重连时透明另开付费会话。
- Stop 立即停止本机媒体并幂等关闭服务端；结算结束与外部资源清理结束分别确认。
- generation、控制所有权和 command ID 隔离迟到/重复事件。默认一个控制客户端；跨设备接管是显式协议，不等于查看共享历史。
- 回前台先查询服务端；iOS 来电/音频会话和 Android 音频焦点/后台限制分别验收。Web 40 秒与原生现有 8 秒不能机械互抄。
- Worker 丢失且上下文不可可靠恢复时结束会话，不承诺透明替代 Agent。协议字段及接口新增仍为待实施设计。

## 4. 供应商扩展、历史与计费

分开产品 session、模型 execution、客户端 generation；供应商恢复可能开启新的 usage epoch。
适配器归一化能力、错误、工具、转写、恢复与用量，保留来源、delta/cumulative 语义、序号及 final 证据。
有效能力取客户端支持、产品许可、route 能力、运行就绪和质量验收的交集；缺失用量是 unknown，不是 0。

用户分钟/已购 AI value、供应商实际成本、LiveKit/基础设施账单分开。
execution 固定 provider/model/channel/region/currency 和费率版本；不能把 GPT 时长公式套给未来 token 模型。
多维用量、整数金额、价格快照、预算/上下文/输出上限及清理截止配套实现；不更改既有用户价格或历史账单。
原有商业代码与 upstream 15% 服务费文档不是本项目新商业发布/定价批准。

目标历史由 Worker 可靠提交最终 turn，API 持久去重/修订并提供 cursor 补取；客户端维护可丢弃缓存。
当前 Web 有服务端历史，但浏览器有限重试和 Worker 内存上下文不等于可靠交付已完成；原生本地历史需显式迁移。
区分打断后实际播放与已生成内容；普通日志不记录音频、正文、凭证。
当前私有 Agent dispatch metadata 含必要上下文及按会话控制凭据，经过 LiveKit；
不得误称所有 Cloud metadata 都无内容/凭据，也不得导出它作证据。

首次多供应商上线只做**新会话固定选路**。先验证假供应商，再单独批准 Gemini 等真实模型、渠道、预算和付费验收。
会话中跨供应商 handoff、自动成本路由及多 Worker 接管后置；LiveKit 插件兼容不等于模型内部状态可无缝迁移。

## 5. 后续任务与完成条件

以下未勾选项均未完成；文档获批不代表功能已部署。

### 阶段归属与衔接（2026-09-24 用户确认）

下文 A/B/C/D/E 是任务分组字母，不是 Phase 编号，尤其 **B 不等于 Phase 5.5B**。

| 顺序 | 整体计划归属 | 工作与当前边界 |
| --- | --- | --- |
| 1 | Phase 5.5B 收尾（分组 A） | 英语 staging Gate 7：主体观测及核对已收尾、例外已记录；真实 Cloud 拒绝已获本轮豁免（未实测），最终报告签结仍待办，尚未正式完成 |
| 2 | 5.5B 之后、5.5C 之前的可靠性与契约加固（分组 B，B1–B7） | 不属于原 5.5B Gate 7 验收范围，不追溯追加门槛；可与分组 A 的剩余收尾并行，尚未实施完成 |
| 3 | 扩展基础与 Phase 5.5C 受控内测（分组 C） | 完成相应加固及内测准入条件后推进，先面向已验收 Web |
| 4 | Phase 6 iOS，之后 Android（分组 D） | 自有 App 身份、统一协议及平台迁移与真机验收；不以当前 Web 通过替代 |

当前 B1 已按下述范围完成，下一轮开发从 **B2 → B3** 继续，再推进 B4–B7；不为此另造 Phase 编号。

2026-09-25 CI 范围决定：Phase 5.5（含 B1–B7 加固及 5.5C）聚焦 Web，
Phase 6 聚焦 iOS，之后再启用 Android 构建及设备检查。
自动 CI 通过 [阶段配置](../.github/ci-stage.json) 与改动路径选择当前客户端任务；
服务端、共享契约和安全检查按兼容及安全需要保留。阶段转换 PR 同步修改配置与验收范围；
原生任务跳过不表示原生已验收，发布对应原生版本前仍需完整平台检查及真机验收。
手动平台/全平台入口和门禁语义见[构建测试说明](build-and-test.md#ci-stage-selection-2026-09-25)。
Gate 7 收尾可以独立签结，不要求先完成 B1–B7；反过来，开始 B1 也不代表 Gate 7 已签结。
每轮分别保留测试、部署、验收及费用证据，并按《发布上线测试与验证方案》归集。

### A. 收尾 Phase 5.5B 英语 Gate 7

- [x] 真实 Cloud CreateRoom/CreateDispatch 限额拒绝门槛已处置为 **WAIVED（未实测）**：2026-09-24 复核社区实质回复后，用户明确采纳本轮英语 staging 豁免及停止监测建议；自动检查 `livekit` 已删除。此次明确授权替代原 9 月 26 日“无回复才豁免”的条件安排，不称为无回复。保留本地 429→真实数据库结算证据，不等同 Cloud 实测；不进行突发压测、耗尽共享额度、购买容量或调整限额。仅限本轮 Gate 7，后续发布重新评审，不豁免其他项目。见[回复复核及决定](../verification/phase-5-5b/2026-09-24-gate-7-continuation.md#cloud-waiver-decision)。
- [x] 汇总现有首音、打断、重连定义与时间戳、样本数、中位数/最差观测及缺测，见 [9 月 24 日收尾矩阵](../verification/phase-5-5b/2026-09-24-gate-7-continuation.md#收尾验收矩阵以本节为当前汇总之前逐步记录保留)；少量样本不报代表性 p95。此勾选仅表示汇总完成，不表示完整计时验收通过。
- [x] 2026-09-24 用户明确接受本轮英语 staging 的计时限制，保留记录、不阻塞推进；断网至检测等缺测、不同诊断版本及少量样本不冒充完整性能达标，不自动新增付费测试。用户随后明确确认本次断网前没有听到声音：本次仅证明连接恢复后可收到新回复和声音，不证明已有声音跨断网恢复；初始无可闻声音的原因未定位，保留为后续可靠性调查项，不声称已修复。
- [x] 汇总本次 CPU/RSS、VPS 与 Cloud 流量、participant-minutes、API 有界窗口错误与内部分钟结算；保留采样、分母和聚合范围限制，不代表最终 provider 费用核对完成。
- [x] 2026-09-24 已核对更新后的 provider 费用及固定日期范围：OpenAI `mural-dev`、All API keys、2026-08-25 至 2026-09-24 显示 USD 0.98，较同范围 USD 0.94 增加 USD 0.04，当前显示总额低于 USD 2.00 上限。用户随后确认没有其他项目并行使用，据此在本轮 staging 运营对账中将显示增量 USD 0.04 归因于本次测试；依据为截图与用户确认，不是逐请求账单核验。金额保留美分显示精度及历史补记限制，新增 $90 充值不是费用，不新增付费授权。
- [ ] 两条历史非 final Worker 记录保留“运营对账未确认”，不追加用户扣费；按已接受决定暂停追溯、观察复发，不断言根因已查明。
- [ ] 最终报告逐项列出通过/豁免/未通过，分开部署、非计费验证与付费验收，引用本轮 Cloud 拒绝豁免及其他已接受限制。最终签结前不得宣布 Phase 5.5B 完成；Cloud 单项豁免不自动完成整个 Gate 7。

已观测成功的英语功能、重连和停止结算保留原证据；缺少时间戳不靠重写记录补成测量。
普通话不在本轮验收内；继续付费前核对剩余授权额度，文档更新不授权新增付费测试。

### B. 5.5B 后、5.5C 前：可靠性与契约加固

这些任务服务当前 GPT/英语，是两阶段之间的加固工作，不属于原 Gate 7 范围，也不作为其追加门槛：

- [x] B1：closed 后仍重试的持久资源清理、Worker 控制 lease 本地截止；注入 DeleteRoom 503、控制通道断开、API 重启与重复关闭。
  2026-09-25：API 419 项及 409 边界补测、Worker 26 项与两仓 CI 通过；[API PR #38](https://github.com/vlingo-ai/mural/pull/38) 与 [Worker PR #16](https://github.com/vlingo-ai/model-gateway/pull/16) 已合并。迁移 028、API→Worker 兼容部署及 staging 非计费核对通过，见[分次证据与保留限制](../verification/2026-09-24-b1-resource-cleanup.md)。故障注入证据来自非计费测试；未执行新增真实媒体/模型调用、Cloud 故障注入、完整 DB 恢复或回滚演练，这些不冒充 B1 已验证结果，也不意味着 Gate 7 签结。
- [x] B2：control 成功响应在 DB 提交后；usage/final 持久去重、重试/补偿；模拟提交前/后崩溃，证明不丢 final、不双扣。
  2026-09-25 第六轮本地非计费回归通过：加密持久队列、重放进程、晚到/冲突 final 不可变证据、乱序高水位、积压门禁，以及**实际 Mural API HTTP/隔离 PostgreSQL + 独立 Worker Python 子进程**故障演练均已在候选代码；LiveKit provider 部分为假实现，仍缺候选 Linux 镜像/权限与 staging 部署验证，**未合并、未部署、不勾完成**。见[B2 分次证据](../verification/2026-09-25-b2-control-receipts.md)。
  第九轮审查补充公平重放：前 100 条永久失败不能饿死后续可交付记录，分页游标必须回绕；Worker 候选本地 38/38 与更新后的 PR CI 通过。永久 4xx 仍需人工对账，此修复不改变 B2 的未完成状态。
  第十、十一轮修复删除重插后的迟到 ACK 误删新 final，Worker 全套 40/40、真实 Linux 镜像持久卷检查及最新跨仓定向 1/1 通过；两仓 PR 已合并（API `a81c3ba`、Worker `5c6a2d3`），Worker 固定摘要镜像已发布。VPS 仍运行 B1，B2 备份、目录/密钥、迁移 029、API→Worker/replay 部署及非计费核验尚待执行；**B2 不勾完成**，详见同一证据第十一轮。
  B2 最新签结（第十二轮）：上述未部署状态为历史快照；隔离跨仓故障测试、Linux 镜像检查及 staging 迁移 029、API→Worker/replay 部署、备份与非计费核验通过。注册记录 1、三个 B2 服务重启 0、待投递队列 0。按开发及非计费部署范围完成；不将未执行的真实媒体、恢复或回滚演练记为通过。供应商未生成 final 或落盘前崩溃仍保留未知用量边界。详见 [B2 最新证据](../verification/2026-09-25-b2-control-receipts.md)。
- [x] B3：OpenAPI 对齐现有 LiveKit/旧 WebRTC 请求响应；拆分 Gateway 必需契约与旧 Live 残留。契约先修正，再生成三端 DTO。
  - 2026-09-26 最新签结：用户授权后 PR #43 已合并，主线 `4a9a26b`；最终候选 `b93debe` 全部适用 CI 通过。以下未合并描述为历史快照。完成范围是已审查 Live DTO 子集，不含原生 runtime 接入或全 API SDK；无业务运行时改变，无需部署。
  - 发布进展：[PR #43](https://github.com/vlingo-ai/mural/pull/43) 已创建；`0c1dc5a` 适用云端检查全部通过，API 427 PASS/1 SKIP（跨仓用例本地已验）。首次镜像构建失败已修复并归集；无 UI/业务运行时变化，无需部署。待审查/合并签结，不提前勾选。
  - 2026-09-25 第一轮：本地候选已修正 Live 创建、状态、capabilities/current 的 schema，并拆分 Responses/legacy-live 检查；定向测试通过。实际 HTTP 契约回归、helper JSON/SSE 和 DTO 生成待办，尚未提交或合并；[证据](../verification/2026-09-25-b3-contract-alignment.md)。
  - 最新候选：上述为首轮历史状态。已补实际路由/隔离 DB、helper JSON/SSE、三端 Live wire DTO 及共享编解码检查；API 全量 428/428、Web 37/37 + mock E2E 2/2 通过。生成范围为 Live 请求/响应，不是全 API SDK；原生应用接入留对应平台阶段。本轮无运行时变更，无需部署；PR/CI/审查待完成，B3 暂不勾选。
- [ ] B4：统一恢复状态和事件 fixtures；覆盖信令断而媒体通、麦克风重发、迟到事件、Stop 竞态和控制过期。
  - 第六轮候选：未知准入按原 UUID 鉴权查询，不重放创建；旧 WebRTC await/文字发送竞态已隔离。Web 74/74、mock E2E 2/2、API 428/428（0 skip）、类型/构建/漂移 PASS。新增 API 路由需 API→Web 部署；PR/CI/上线核验待办，不勾完成。细节与失败记录见 [B4 证据](../verification/2026-09-26-b4-recovery-protocol.md)。
  - 第五轮最新：SDK 恢复核查服务端状态，迟到准入关闭失败可重试；响应未知不伪报 idle。Web 70/70、类型/构建、mock E2E 2/2 PASS。未知准入原幂等身份协调、旧 WebRTC 边界与发布仍待办，未部署。
  - 第四轮最新：共享 reducer 已接 LiveKit Active/恢复/Stop 门禁；产品截止转单调时钟且重连不延期。Web 65/65、类型/构建、mock E2E 2/2 PASS。未部署；SDK-only 状态协调、迟到准入关闭可见性和旧 WebRTC 竞态仍待办。
  - 第三轮：后备 Room 重建前查询服务端 active/有效截止；Stop 待 closed 才 idle，失败可 Retry closing。Web 63/63、类型/构建及 mock E2E 2/2 PASS；共享模型正式接入、其他异步竞态和发布验收待办，未部署。下列较早轮次状态保留作历史。
  - 第二轮本地候选：signal-only 不固定 5 秒重建 Room；Stop/新会话后的迟到媒体授权停轨且不覆盖新流。Web 52/52、mock E2E 2/2、类型/构建 PASS。共享模型尚未接入，状态查询/close 确认及发布待办；未部署。
  - 2026-09-26 已启动：规范同级工作树 `mural-b4-recovery-protocol`；新增[恢复参考协议](../shared/contracts/live-recovery-protocol.md)、共享轨迹与隔离 Web reducer。尚未接入 LiveConnection，未改变线上 UI；Web 适配、集成测试和发布验收待办，不勾完成。
- [ ] B5：真实本地 LiveKit、真实 SDK、合成音频/假 Agent 的非计费集成；mocked Room 和旧 WebRTC Playwright 不能替代。
- [ ] B6：Worker→API 最终历史可靠交付和 cursor 补取，覆盖浏览器掉线/刷新；原生迁移保留本地历史。
- [ ] B7：无正文事件/耗时指标；验证脚本对不健康/Worker 未注册失败退出；发布 manifest、digest 与恢复演练。发布工程子项与验证方案 A2 联动：把 API 纳入与 Worker 一致的受控 CI 构建、测试、私有镜像发布及 digest 固定流程，VPS 改为只拉取经验证的候选镜像；设计专用最小权限的私有镜像只读拉取身份，不把个人 Mac 凭据当作长期部署依赖。

2026-09-25 用户采纳的构建方式决策：**B1 不为形式统一而重建已验证的 API/Worker 镜像**，维持当前 API 本地构建、Worker Actions 发布的候选及各自证据；后续按 B7/A2 统一流水线，不追溯增加 B1 或 Gate 7 门槛。该后续任务的验收须证明 API/Worker 各自的源码 commit、CI 测试 run、镜像平台和 registry digest 可追溯，部署按 digest 而非浮动 tag，失败/权限不足时停在部署前，旧镜像和私有配置可回滚；不得把本地 image ID 冒充 registry digest，也不得因源码仓库公开而自动公开 API 镜像。流水线合并、镜像发布、VPS 拉取和运行验证分别记录，不能互相代替。

B1 已部署并完成限定范围的非计费核对；后续先 B2/B3，再推进共用恢复协议、可靠历史与测试。安全独立的 Gate 7 汇总不必等全部重构。
各改动须测试并部署匹配 API/Worker/客户端；实施前风险继续保留。

发布验证工程化见 [发布上线测试与验证方案](operations/release-verification-plan.md)（2026-09-24 复盘设计）
及[报告模板](../verification/release-verification-template.md)。方案区分现有资产与待实现 A1–A5：
优先统一证据/报告和严格非计费门禁，故障注入随 B1–B6 修复推进；不表示新自动化已实现，
不改变上述产品修复顺序，不追溯增加 Gate 7 门槛或授权新的付费测试/部署。

### C. 扩展基础与 Phase 5.5C 受控内测

- [ ] C1：session/execution、版本化 route/capability/price、多维用量 schema；GPT 行为兼容，假供应商验证不同计量/错误。
- [ ] C2：告警、并发/预算、kill switch、备份恢复、最小 DB 权限、凭据独立轮换，再确定内测用户与容量。
- [ ] C3：保留单 VPS/单会话控制器边界；没有所有权租约/故障转移设计不得直接扩 API 副本。
- [ ] C4：5.5C 先面向已验收 Web，不以尚未开发的 iOS 为启动前提。Cloud 套餐按实测需求另行批准，不自动购买 Ship/Scale。

### D. Phase 6 iOS → 后续 Android

- [ ] 确定自有 App 名称、Bundle ID、签名、Google iOS OAuth，不接管 upstream 项目/域名。
- [ ] iOS 接入产品协议、LiveKit Swift SDK、历史迁移和平台设备适配；兼容部署服务端后再发布客户端。
- [ ] Android 接入相同协议和 LiveKit Android SDK，保留 hosted ownership/账务防重；自有包名、签名和 OAuth 另验。
- [ ] 三端执行共用 fixtures，分别做真机网络、来电/音频焦点、后台、蓝牙、重连后收发、Stop/结算及隐私验收。
- [ ] 模拟器/Web/一个平台通过不替代其他端；未迁移客户端保持兼容，不静默打开新能力。

### E. 独立后续范围

第二供应商真实接入与新会话选路，其后才评审 handoff/自动路由；普通话/粤语分别重开质量门槛。
商业定价、购买、支付、商店发布、跨设备接管及规模化部署均须独立完成条件，不随本计划启用。

## 6. 发布、安全与身份约束

- API 无 OpenAI key；Worker/Gateway 使用不同工作负载密钥。API/Worker 共享 LiveKit 项目凭据为 staging 例外，后续拆分；`LIVEKIT_CONTROL_SECRET` 仅 API 持有。
- 公网 TCP 22 是动态 VPN 临时例外：禁 root/密码、仅公钥、UFW limit、安全更新/日志；长期改私有或受限入口。内部端口不得公开。
- Web 使用 `GOOGLE_WEB_CLIENT_ID`；新 iOS 使用 `GOOGLE_IOS_CLIENT_ID`。Android 单数逻辑身份不替换现有 `GOOGLE_ANDROID_CLIENT_IDS` 列表与 `GOOGLE_ANDROID_SERVER_CLIENT_ID` 实际字段。
- 发布前核查版本/活跃会话、保留镜像及私有配置、加密备份和异机验证；不打断会话。兼容顺序迁移/授权/部署后核对健康、DB、契约、镜像和脱敏日志。
- 未知费用由运营对账；用户已结算不代表供应商已停止，30 秒 lease 不是所有网络故障下的费用上界。
- 本轮仅整理文档，不改实现、DB、价格、密钥、线上配置或服务，不发起付费调用。
