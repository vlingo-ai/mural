# 发布上线测试与验证方案

版本：2026-09-25。由 Phase 5.5B 实际开发、部署、故障与验收过程复盘形成。
**本文件是可复用方案及自动化实施设计，不代表下述新工具、CI 或监控已经上线。**
当前能力以本节资产清单为准；未执行的检查不得记为通过。

**文档地位：用户于 2026-09-24 指定本方案为项目最高优先级的必维护文档之一，持续生效。**
每次开发迭代完成测试与验证后，须先完成本方案的归集更新，再报告该迭代完成；
失败、阻塞、未执行项也必须如实归集，不能只记录成功。此要求不改变产品阶段顺序或费用授权。

范围服从[项目开发基准](../web-ios-model-gateway-plan.md)，部署操作服从
[现有 runbook](../../deploy/phase-5-5b/README.md)及 AGENTS.md。
本方案不追溯增加本轮 Gate 7 门槛，不沿用其临时豁免到下次发布，不改变语言、定价或供应商范围。
当前英语 Web staging 是首个应用对象；iOS、Android 和新供应商逐步接入相同证据协议。
总计划的 B1–B7 是 Phase 5.5B 后、5.5C 前的加固任务，可与 Gate 7 收尾并行；
本方案的 A1–A5 则是自动化实施工作包，两者都不是新增 Phase 编号，不改变原 Gate 7 范围。

## 1. 复盘：把一次性经验转为发布规则

| 本轮经验 | 复用规则 |
| --- | --- |
| 多次重连后 Active 但不能收发，或声音已断但页面仍 Active | 分别验证信令、上行媒体、下行媒体、Agent 响应、产品状态；状态名不是成功证据 |
| 断网前没有听到声音，恢复后首次发声 | 初始双向会话确认是完整重连测试的前置条件；未满足时停止该案例或记部分结果，不混入正常首音样本 |
| 短断网未产生浏览器 offline 事件 | 缺测为 null；浏览器网络事件、人工切网、SDK 检测不是同一时点 |
| 首音/打断只取得少量能量候选，扬声器与耳机结果不同 | 固定输入输出及诊断版本；听感与能量候选分别保存；不将样本最大值称为最坏上界 |
| 历史在重连后缺少之前的 turn | 测试断网前/期间/后历史完整性、去重、刷新后补取，不只检查最后一条字幕 |
| API closed、预留释放，但外部清理和 provider final 可能不确定 | 用户结算、供应商用量最终性、房间/模型释放是三个独立结果 |
| 费用显示延迟、充值、不同筛选范围 | 固定项目/日期/时区，分开余额、消费、分钟和 Cloud 用量；增量必须说明归因依据 |
| 采样脚本因 Docker PID 表头失败 | 先离线 fixture，再真实非计费短试采样；首个完整样本成功后才允许付费观测 |
| Mac 断网、SSH 中断及 scp 权限问题 | VPS 独立有界采样；明确 Mac/VPS 执行位置；按阶段检查返回码和校验和，禁止失败后继续解密 |
| 截图 No data 被误当作 0；空输出易误认为失败/成功 | 每项输出结构化状态及分母；未知、未执行、零值明确区分 |
| 单凭公网 nc 结果难判端口风险 | 联查云安全组、UFW、监听地址、容器网络及无代理外部探测；不以一项结果替代全部 |
| 反复测试消耗预算 | 一次授权对应有界测试计划；失败即收证，不自动反复新建付费会话 |

来源：[9 月 24 日证据与限制](../../verification/phase-5-5b/2026-09-24-gate-7-continuation.md)、
[重连调查](../../verification/phase-5-5b/2026-09-23-reconnect-incident.md)、
[架构审查](../reviews/2026-09-23-phase-5-5b-architecture-review.md)。

## 2. 已有自动化资产与真实缺口

初版只检查 Mural 本地源码及已有历史证据；2026-09-25 增补已核对的 Worker 手动发布工作流及成功 run。
这项盘点当时不代表重新执行线上检查、审计 Gateway 全部 CI，或证明 B1 已部署；B1 后续部署证据见迭代归集表。

| 已有资产 | 当前可复用能力 | 不能据此声称 |
| --- | --- | --- |
| [Checks CI](../../.github/workflows/checks.yml) | Web 单元/构建/Playwright，Swift core，API + PostgreSQL 测试，部署脚本语法/Compose/镜像构建 | 当前发布 CI 已绿、iOS 真机已验、真实 LiveKit 链路已验 |
| [Worker 手动发布工作流](https://github.com/vlingo-ai/model-gateway/blob/main/.github/workflows/publish-livekit-worker.yml) | 仅 main 手动触发，使用短期 `GITHUB_TOKEN` 构建并发布私有 GHCR 镜像；[B1 run](https://github.com/vlingo-ai/model-gateway/actions/runs/36022241117) 成功并记录源码 commit/digest | API 已有同等发布流程；VPS 已拉取、运行或验证该 Worker；私有拉取凭据已解决 |
| [Contracts](../../.github/workflows/contracts.yml)、[Secrets](../../.github/workflows/secrets.yml)、[Android](../../.github/workflows/android.yml) | 跨端静态/fixture 检查、脱敏密钥扫描、Android 构建/测试任务 | 契约与全部运行时行为一致；未来原生 LiveKit 迁移已实现 |
| [preflight.sh](../../deploy/phase-5-5b/preflight.sh) | 配置、部分 digest、权限、DNS、Compose 检查 | 所有部署镜像均已锁定、Cloud 就绪、预算一定足够 |
| [active-sessions.sh](../../deploy/phase-5-5b/active-sessions.sh) | 列出数据库非 closed 会话；查询失败退出 | 有会话时自动阻止部署；无结果证明 Cloud 无房间 |
| [backup.sh](../../deploy/phase-5-5b/backup.sh) | pg_dump → gzip → age，受限权限 | 解密/压缩完整性已验、异机副本存在、恢复演练通过 |
| [verify.sh](../../deploy/phase-5-5b/verify.sh) | HTTP 成功、关闭的音频能力检查、容器信息及有限日志模式扫描 | 打印 running/health 就代表严格判定；Worker 注册和媒体可用已核实；日志绝不含敏感内容 |
| [capture-resources.sh](../../verification/phase-5-5b/capture-resources.sh) | 已在 VPS 跑通有界无正文 CPU/内存/RSS/网卡采样 | 通用容器发现已实现、连续峰值、独占 RSS、单会话计费流量 |
| [summarize-api-errors.py](../../verification/phase-5-5b/summarize-api-errors.py) | 按输入窗口计数、去重、无分母失败、输出脱敏汇总 | 全链路错误率；未识别行可以忽略 |
| [TimingRecorder](../../apps/web/src/live/timing-diagnostic.ts)、[本机校准](../../verification/phase-5-5b/local-audio-calibration.html) | 浏览器相对计时、能量候选、人工设备校准 | 物理可闻证明、完整网络计时、跨主机时间可直接相减 |

现有 [Web E2E](../../apps/web/e2e/live.e2e.ts) mock 了 API、麦克风和旧 WebRTC。
保留其价值，但另建真实本地 LiveKit + 真实 SDK + 假 Agent/合成音频层，不能改名冒充真实集成。
脚本读取私有 `.env` 时视其为可信可执行输入；自动化不得接收 PR 提供的任意环境文件或路径。

## 3. 每次发布的流水线

```text
变更影响与批准 → 非计费 CI → 候选版本冻结 → 发布前门禁与备份
→ 兼容顺序部署 → 非计费上线核验 → 按需授权真实体验测试
→ 停止/清理/结算 → 延迟费用对账 → 最终报告与观察期
```

阶段以 release_id + run_id 关联，失败停在当前门禁；不能因后续一项成功覆盖前面的失败。

| 阶段 | 自动化设计 | 人工/授权边界 | 输出 |
| --- | --- | --- | --- |
| R0 影响分析 | 按文件/契约变更建议测试集合，校验必需用例未遗漏 | 发布负责人确认三端兼容、UI 变化、迁移与费用范围 | 测试计划与风险清单 |
| R1 非计费 CI | 单元、契约、真实隔离 DB、假供应商故障注入、构建及扫描；后续统一 API/Worker 候选构建 | 不能使用生产凭据；PR 无部署权限；当前 API 的 CI 发布尚未实现 | 测试结果、跳过项、构建摘要 |
| R2 冻结候选 | 对齐各仓 commit、CI run、镜像 registry digest/平台、Web 资源摘要、迁移版本；本地 image ID 另列 | UI/UX 变化在合并前说明；合并、镜像发布与部署分别确认 | release manifest、兼容矩阵 |
| R3 部署门禁 | 配置允许项、磁盘、DB、活跃会话及目标 Cloud 资源检查；加密备份/传输/恢复证据；私有镜像拉取权限与目标 digest 可用性 | 有活跃用户等待；操作员保留私有凭据，不向助手提供密码；不自动公开私有包 | preflight/backup/rollback 结果 |
| R4 部署 | 单发布锁、执行日志、幂等步骤与超时；先兼容服务端再客户端 | 仅执行已授权目标；迁移按 runbook；不改变用户价格/语言 | 实际版本与步骤结果 |
| R5 上线非计费核验 | 严格健康、DB readiness、镜像、契约/鉴权拒绝、Worker 注册、端口、日志 | 不创建真实模型会话；外部检查失败不视为业务健康 | smoke.json、脱敏错误摘要 |
| R6 真实体验 | 经批准的测试计划可编排开始/采样/截止/收证 | 听音、语义、真实切网、蓝牙/真机仍须人；额度拒绝/停 Worker 独立批准 | 单案例报告及人工确认 |
| R7 停止与对账 | 幂等 close、预留/最终用量/清理核验；导入官方费用导出并比较固定窗口 | 归因有争议或 final 缺失交运营；禁止补扣未知费用 | settlement/cleanup/cost 三份结果 |
| R8 签结与观察 | 自动汇总证据、告警及回归趋势；检测过期例外 | 负责人签结或豁免；有缺项不生成全绿 | 最终报告、风险及跟进任务 |

**方案状态与验收结果不同**：实现状态使用 existing / planned；执行结果使用
PASS / FAIL / UNKNOWN / NOT_RUN / WAIVED / NOT_APPLICABLE。
必需项为 UNKNOWN、NOT_RUN 或 FAIL 时不通过。WAIVED 必须引用授权人、理由、范围和有效期；
NOT_APPLICABLE 必须有影响分析依据，不能自动跳过没实现的必需测试。
staging 可按明确例外签结；生产发布必须重新评审，不能自动继承 Gate 7 例外。
条件豁免的前提发生变化（例如已收到回复）时，不能套用原“无回复”授权，须重新判断并记录明确决定。
社区建议不等于供应商的支持承诺；API 速率限制与并发/资源配额拒绝分开归类。
官方文档与项目控制台限额不一致时先澄清，不以突发请求探测上限；每项豁免须保留未实测的风险及适用发布范围。

## 4. 按变更选择测试，避免每次重跑全部付费案例

2026-09-25 CI 阶段规则：Phase 5.5 使用 Web，Phase 6 使用 iOS，之后使用 Android；
配置入口为 [ci-stage.json](../../.github/ci-stage.json)，执行说明见
[阶段选择](../build-and-test.md#ci-stage-selection-2026-09-25)。当前阶段的客户端按改动范围验证，
API/共享输入变更同时验证服务端和当前客户端；安全与轻量共享契约检查始终保留。
纯 Markdown 不触发客户端构建；Android 发布文档在 Android 阶段仅触发轻量发布校验。
未启用平台标记 NOT_APPLICABLE，不能写为测试 PASS，也不能用于对应平台发布签结。
阶段转换和原生发布须显式启用完整平台检查；手动全平台需运行 Checks 与 Android 两条工作流。
范围解析错误、必选任务失败/取消/意外跳过必须由汇总门禁阻断；不使用整个必需工作流跳过来绕开失败。
本轮旧模拟器失败保留为历史 FAIL，阶段策略调整并不证明模拟器缺陷已修复。

| 变更类型 | 必选非计费验证 | 按需真实验证 |
| --- | --- | --- |
| 文档、纯样式 | 链接/构建、受影响 UI 检查 | 无；若改变麦克风/状态/授权交互则升级为媒体变更 |
| 账户/API/数据库 | 运行时契约、权限、迁移前后与旧客户端兼容、备份恢复 | 真实登录交互；涉及会话准入时批准最小语音样本 |
| 重连、音频、Worker、SDK | 共用轨迹、真实本地媒体链路、恢复/停止竞态、final/清理故障 | 初始双向音频→断网→恢复后新双向交互→Stop，固定设备和诊断版本 |
| 账本、计费、usage | 重复/乱序/迟到/缺失用量、事务故障、整数精度、旧费率快照 | 必要的单次有界 provider 对账；不能拿真实用户做故障注入 |
| 历史/字幕 | 合成 turn 的顺序/修订/去重/断网补取、刷新/重启、权限隔离 | 语义/可读体验抽查，不导出用户正文 |
| 新供应商/模型 | 能力矩阵、provider adapter、不同计量及错误、工具/历史契约 | 每个新 route 单独批准预算与质量案例；禁止隐式中途切换 |
| 新原生版本 | 共用 fixture + 对应平台测试、服务端向后兼容 | iOS/Android 真机网络、前后台、来电/音频焦点、权限及蓝牙 |
| 基础设施/防火墙/域名 | DNS/TLS、监听、安全组/UFW、出口、恢复/回滚 | 经批准的代表性真实体验，不以公网健康成功代替媒体验证 |

PR、候选发布、上线后是三种运行模式；完整故障矩阵在隔离环境运行。
夜间/定期回归是未来 CI 设计，当前不创建调度任务、不自动消耗 provider 额度。

## 5. 自动化优先补强的故障用例

以下与基准 B1–B7 对齐；允许先写会失败的回归测试，再随相应修复通过，不宣称现有实现满足。

| 用例 ID | 注入条件（默认隔离环境、假供应商） | 必须断言 |
| --- | --- | --- |
| AUTH-01 | 非 allowlist、过期 token、越权读取/关闭、泄露风险 payload | 拒绝且无预留、无模型执行、无敏感日志 |
| ADMIT-01 | 本地准入不足、模拟 CreateRoom/CreateDispatch 429/503 | 用户安全错误、释放预留、已创建资源有清理结果；不混同真实 Cloud 拒绝 |
| MEDIA-01 | 信令断媒体通、媒体上/下行分别断 | 状态不盲目 Active；沉默/静音不误判失败；独立可观测超时 |
| RECONNECT-01 | SDK 重连、Room 重建、麦克风需重发、迟到事件 | 同产品 session、无重复付费执行、generation 隔离、恢复后双向媒体实际可用 |
| STOP-01 | 连点 Stop、Stop 与恢复竞态、关闭请求丢失 | 本地媒体及时停、服务端幂等关闭、旧事件不能重新 Active |
| LEASE-01 | Worker 硬停、Worker↔API 断、API 重启 | 到期行为与已批准期限一致，最后可信用量结算，未知 final 单独标记 |
| CLEAN-01 | closed 后 DeleteRoom 503/超时/精确 not_found | 持久重试与截止/告警；结算一次；成功/not_found 才确认对应资源清理 |
| USAGE-01 | final 提交前崩溃、提交后回包前崩溃、重复/乱序 cumulative、错误回执或密钥、前批永久失败造成分页饥饿 | 只在 DB 提交且回执精确匹配本次用量后清队列；跨进程重放不双扣；第 101 条可越过前 100 条失败记录，游标回绕重试旧记录；迟到证据进运营对账，待投递队列不冒充零 |
| HISTORY-01 | 最终 turn 发送失败、浏览器刷新、断网前/中/后 turn、重复修订 | 持久去重、cursor 补取、无越权；计数/合成 fixture 摘要匹配 |
| RELEASE-01 | 错镜像、unhealthy、Worker 未注册、日志读取失败、空分母 | 非零退出；UNKNOWN 不伪装 PASS；部署停止或进入回滚决策 |
| RESTORE-01 | 损坏备份、错误密钥、缺运行权限、旧 schema | 校验失败阻止发布；隔离恢复完整性与迁移兼容被真实测试 |
| CONTRACT-01 | 当前/旧 transport、缺字段、额外私有字段、错误格式、未知 Gateway profile | 创建与状态响应分别验证；null 与缺失不混同；Responses 默认检查不依赖旧 Live，显式 legacy 检查仍拒绝缺项；fixture 通过不等于真实 HTTP 或 DTO 已验证 |

真实 Cloud 拒绝不允许通过耗尽共享额度、购买容量或影响别人来实现；有供应商支持的隔离办法才另行批准。
自动测试应验证非计费保障本身：无真实 key、模型出口禁用、只允许本地假服务；跑完真实供应商请求数为零。
Worker/Gateway 的独立流水线需产出可关联的版本与测试证据；Mural CI 不代替它们。
开立候选 PR 前，应执行与目标 CI 相同的格式检查、锁定依赖测试及部署 Compose 解析；Compose 必填变量增加时须同步更新不含真实密钥的 `.env.example`。涉及控制事件投递或回执语义时，须同时复查解析器单测、持久化回执测试及候选 PR 实际 diff，不能只凭另一未提交工作树的测试通过。本地无 Docker 或受沙箱限制时明确记为未本地运行，不能把 YAML 解析或 shell 语法检查写成 Compose 配置已通过；以 PR CI 的实际结果补齐。

USAGE-01 的持久回执身份还须覆盖删除重插竞态：多个发送者持有旧记录时，删除后新写入的 final
不能复用旧版本；迟到 ACK 在进程重启后也不得删除新记录。镜像 CI 须按实际 UID、0700 卷、
只读根文件系统和禁用网络验证跨容器重放存储；本机无 Docker 时以实际 CI 结果记录，
不以本机 SQLite 单测代替 Linux 卷权限证据。

2026-09-24 B1 本地实现补充（[证据及 2026-09-25 部署记录](../../verification/2026-09-24-b1-resource-cleanup.md)；下列测试最初为本地证据）：
LEASE-01 须覆盖“续约 HTTP 卡住但 watchdog 独立到期”、启动无明确 grant 不开模型、
传输时间扣减、迟到响应不复活，以及 SDK 共享连接导致关闭无效的风险。
CLEAN-01 须覆盖确认写 DB 失败后的重试；未知 CreateRoom 的暂时 not_found 不得终止清理或当作零用量。
API 419 项与 Worker 26 项本地测试已通过；完整本地媒体链路、生产 runtime 权限和告警仍需独立验证。

## 6. 真实体验测试：少而有边界

1. 先检查批准环境、账户、provider/route、最大会话数/总秒数/美元上限及有效期。
   费用上限、用户分钟和 Cloud 配额分别检查；余额存在不是授权。
2. 非计费音频校准确认输出、输入、权限和 AudioContext；人确认确实听到测试音。
   耳机/扬声器分别标注，不混合统计。纯合成音测试不证明 Agent 可用。
3. VPS 独立采样先跑短试验，确认至少一个完整样本再开通话；中断 Mac Wi-Fi 不应停止服务器采样。
4. 初始测试先说固定英语提示，确认对端理解并产生新语义回复、可闻音频、字幕；人工确认关联测试步骤。
   超过预先批准的首音观察期限仍无声则停下收证，不用断网“治好”后宣布首音通过。
5. 重连记录网络动作/SDK/媒体事件，恢复后用新的提示验证上行和下行；仅 Active 或旧缓存声音不通过。
   浏览器 `offline` 不是物理网络断开证据；自动化的 HTTP offline 不代表 UDP/WebRTC 断网。
6. 自然打断在人与 Agent 同时发声时观察停止及新指令响应；能量下降也可能是自然句尾，须人工确认。
7. 到时、失败或人工停止立即进入关闭流程。关闭、采样收尾和安全清理不因 CI 取消而省略。
   已批准的测试房间可精确清理；不能全项目删房间或停止共享 Worker。
8. 没有可靠的服务端截止/Worker 本地止损保障时，禁止无人值守真实测试；浏览器计时器不是最终费用保护。

当前 15 分钟、USD 2、44 秒余额都是历史 Gate 7 的数据，不能硬编码为未来测试额度。
本轮初始未听到声音的体验仍需后续调查，不因本轮例外接受而从回归集中删除。

## 7. 测量与判定口径

- 同一进程耗时用单调时钟，UTC 用于日志窗口关联。不同主机先测时钟偏移/误差，不能直接相减声称精确延迟。
- 首音：Start→首个可播放声音候选；用户是否听到另字段。受重连影响的首音单独分组。
- 重连：网络事件→检测、检测→media ready、检测→新声音、恢复网络→新双向可用分别命名。
  缺事件为 null，不混用起点，不把用户迟开口全算为系统恢复延迟。
- 打断：本地讲话候选→远端静音候选，附人工“接受新意图”的确认；不等同物理声学精密测量。
- 按客户端/设备/网络/provider/模型/SDK/诊断版本分组，报告成功/失败/缺测/尝试数，不能丢弃失败样本。
  小样本只报 n、中位数、最差观测；统计方法及最低样本计划在测试前确定，不事后选阈值或宣称 p95 SLA。
- 资源：全采样与会话窗口汇总均保留，说明间隔/缺口、Docker CPU 定义、共享 RSS 重复计数。
  主机网络含背景流量，host-network 的 Docker 0B 不记为真实零流量。
- 错误：API 总数与排除 health 的分母均报；Worker/Gateway/媒体各自计数；预期注入错误与意外错误分别标注。
  日志读取不全、未知格式、分母为空应为 UNKNOWN/FAIL，而不是 0%。
- 结算：预留释放、扣费一次、final 来源、运营差额、外部清理分别检查。不是一项 final=true 覆盖一切。
- 费用：固定项目/UTC 日期窗口与读取时间，区分 provider 官方显示、内部估算和最终发票。
  重复导入按供应商导出批次/窗口去重；补记覆盖同窗口版本，不与旧值累加。
  用量 unknown 不填零，充值不算消费；人工“无并行使用”可支持运营归因，仍保留显示精度/历史补记限制。

每次发布必须在 R0 写出目标与依据：正确性零容忍项（越权、重复扣费、泄露）、性能观测目标、
允许的缺测率和对比基线。当前历史约 15 秒首音不是产品性能标准；未定义性能标准只能报告观测，不能自动签性能 PASS。

## 8. 发布、备份、回滚与运维

- 发布锁覆盖同一环境；部署前读取活跃会话后还需防止检查到变更间的新准入竞态。
  待实现维护准入/排空机制前，有人监督并在破坏性步骤前复查，不能声称无竞态自动部署。
- manifest 记录每个组件实际 digest/源码，不只记录 VPS HEAD；构建产物、部署产物和浏览器资源摘要对齐。
  registry digest 与本地 image ID 分字段，不把二者混用。Web 配置允许项含公开 OAuth ID，不含秘密。
- 后续 B7/A2 将 API 和 Worker 统一为受控 CI 测试、构建、发布私有镜像，再由 VPS 仅拉取固定 digest。
  每个候选关联源码 commit、CI run、镜像平台/registry digest、拉取结果与实际运行 image ID；
  不能把 PR 通过、工作流成功、包中存在镜像或本地构建，单独认定为已部署。
  私有拉取使用专用最小权限身份及受控生命周期，不长期依赖个人 Mac 凭据；认证失败停在部署前，
  不通过公开镜像、改用浮动 tag 或把本地 image ID 填入 digest 字段绕过门禁。
  B1 保留已完成构建/发布校验的 API 本地候选镜像及 Worker Actions 候选镜像，
  不为流水线形式统一而重建；其后已完成 VPS 部署与非计费核对，见迭代归集表。
  后续统一是计划任务，不是 B1/Gate 7 追加门槛，也不授权自动部署或付费测试。
- 备份：私有目录、唯一名称、管道失败传播、成功文件与未完成文件区分、源/目标 SHA-256、异机 age 解密+gzip 校验。
  解密私钥留恢复机；CI 不持有生产备份解密密钥。压缩校验通过不等于 PostgreSQL 恢复通过。
- 隔离恢复演练还需验证 schema、关键表计数/约束、运行角色权限。当前 dump 使用 no-owner/no-privileges，
  必须记录角色/grants 的安全重建步骤；恢复出的应用禁止向 Cloud/provider 发请求，真实数据不上传 CI artifacts。
- 从实际运行配置和 `pg_roles` 核实数据库身份，不照抄历史 README 的角色名。
  若 API 正使用超级用户，应登记权限过大的风险并单独设计最小权限迁移；不把“不需要 GRANT”当作安全达标。
  2026-09-24 B1 预检发现 staging API 使用 `mural` 超级用户，未改权限，详见 B1 证据。
- 回滚保留旧镜像、私有配置、兼容迁移及备份。DB 迁移遵循 expand/contract；不能把回滚镜像等同回滚数据。
  自动回滚只用于预先批准、无活跃会话且数据兼容的动作；不自动从备份覆盖线上 DB，不执行 destructive down/prune。
- 观察期由发布计划事先规定时长、查询频率、负责人及退出条件，不无限等待。
  监控公开健康、Worker 注册、无声/恢复失败率、待清理时长、未 final、预留异常、费用增长、CPU/内存/磁盘及证书。
  业务无流量不等于健康或零费用；常驻合成巡检默认不调用付费模型。
- 凭据泄露/越权/重复扣费立即升级事件并停止扩大发布；资源未清理、预算接近上限触发有界止损和人工接管。
  单纯观测平台暂不可用输出 UNKNOWN，去重告警，避免用重复真实会话诊断。
- 告警应含环境/run_id/不含正文的原因及 runbook 入口，按故障级别通知负责人；恢复通知与升级策略纳入配置。
  调度和通知渠道另行实施授权，本文件不创建实际监控任务。

## 9. 自动化实施接口与证据包（设计，尚未实现）

建议统一入口命名为 release-check，具有独立的 collect / evaluate / report 步骤；不是现在可执行的命令。
默认仅本地评估或只读，部署与 live-paid 必须显式模式。一个发布可含多个 run，重跑生成新 run_id，保留失败记录。

输入 release manifest 至少包括：schema_version、release_id、run_id、环境与目标允许列表、
各仓 commit/镜像 digest 或 image ID、迁移版本、客户端/provider/route/语言范围、用例列表、
预期断言及超时、费用授权引用/截止/总额、回滚引用、批准的例外。
秘密仅经受控运行环境注入，不写 manifest，不导出环境文件或 secret hash。

每个 check 输出统一结构：check_id、status、source（automation/manual/operator-confirmed）、
开始/结束 UTC、单调耗时、schema/collector 版本、value/unit/denominator、missing_reason、
evidence 相对路径与 SHA-256、scope、waiver 引用。手工确认不可伪造成 automation 来源。
建议退出码：0=必需项通过或有效豁免，1=断言失败，2=输入/采集不完整，3=授权/环境门禁拒绝。
合法豁免依旧在汇总中醒目标出；退出 0 不输出“无风险”或“生产就绪”。

证据包布局（待实现的生成器输出；[报告模板](../../verification/release-verification-template.md)现已可人工复用）：

```text
<release-id>/<run-id>/
  manifest.json        # 审核目标与实际版本、授权引用
  checks.json         # 每项状态和来源
  timing.json         # 无正文事件；缺测保留 null
  resources.json      # 窗口、采样数、单位及限制
  errors.json         # 各组件独立分母
  settlement.json     # 只读账本与 final 证据
  cleanup.json        # 目标资源释放证据，不输出 metadata
  cost.json           # 固定窗口、增量、归因、补记版本
  report.md           # 人可读总结、例外、待办、签结
  checksums.sha256
```

使用允许字段导出；不存音频、转写正文、邮箱、token、Authorization、私有 dispatch metadata 或原始 docker inspect。
生产证据保存在私有受控存储，CI 只上传脱敏合成测试材料；日志和失败 artifacts 同样先脱敏。
保留策略由环境配置指定，必须覆盖回滚/事故调查窗口；不把敏感备份与普通测试报告一起自动上传或自动删除。
只读采集身份与部署身份分离；sudo 无法使用时明确交给操作员执行指定脚本，不索取密码或扩大 Docker 权限。

## 10. 分阶段实施与验收条件

以下是本方案新增自动化实施清单，尚未实现；按基准 B1/B2/B3 的产品修复优先级协调，不抢先启用生产变更。

| 顺序 | 工作包 | 实施验收 |
| --- | --- | --- |
| A1 | 通用 manifest、结果 schema、脱敏报告生成器；参数化已有采样/错误工具 | 用本轮脱敏 fixture 重放；null、空分母、未知行、重复、过期豁免、截断采样、错误单位均测试；非法证据不能签结 |
| A2 | 严格 verify、部署会话门禁、版本/备份/恢复证据与单环境锁；与 B7 联动统一 API/Worker 受控 CI 镜像发布及私有只读拉取 | unhealthy/未注册/错 digest/读取失败非零退出；有活跃会话阻止部署；恢复演练真实成功；两组件的源码/CI run/平台/registry digest/实际运行 image ID 可追溯，未授权拉取或版本不符阻止部署，旧镜像可回滚 |
| A3 | 与 B1/B2/B3 同步，扩展 DB/账本/清理/契约故障矩阵 | 每个故障注入前后证明幂等与持久性；持久确认与资源释放分开；旧客户端兼容 |
| A4 | 与 B4/B5/B6 同步，真实本地 LiveKit + SDK + 合成媒体 + 假模型；共享三端事件 fixture | 不带生产 key、禁止真实模型出口仍通过；覆盖上下行独立故障、Stop/恢复竞态、历史补取 |
| A5 | 经批准的真实测试编排、平台真机清单、账单导入及运维告警 | 未授权/超时/超预算拒绝启动；失联有止损；人工听感保留独立来源；补记不重复累计 |

首个建议实现的是 A1/A2：减少每次复制终端命令、截图解释和手工拼表；无需开付费会话。
CI 配置检查不等于这些工作包已完成。实施时每个包分别测试、评审、记录发布影响；
如涉及 UI/API/Worker 运行时变更，按 AGENTS.md 配套部署后才能交付为“已上线”。

## 11. 每轮迭代后的强制维护闭环

本文件是验证规范与复盘的统一入口，不是会被新记录覆盖的流水日志。
每轮迭代的执行者负责更新，评审人检查；未完成以下闭环，不将迭代标记为完成：

1. 在 `verification/` 保存带日期/版本的脱敏验证报告，列出实际执行、失败、跳过、缺测、部署状态与例外。
   证据原件需要私有保存时仅记受控引用，不提交私钥、备份、录音或会话正文。
2. 在下方迭代归集表加入记录，关联报告/源码或发布版本、结果、可复用发现及后续任务。
3. 将新发现提升为本文件的规则、用例或门禁；同步受影响 runbook 与报告模板。
   已实现的自动化须关联代码/测试证据后再从 planned 改为 existing；未部署的运行时变更不能记上线。
4. 若本轮没有新增可复用规则，明确写“已复查，无规则变更”，仍须关联测试结果，不能省略归集。
5. 在 PR 与交付说明提供本方案更新和证据链接。纯文档迭代也记录文档检查，不能冒充应用测试。
   后续修订追加更正依据并保留旧报告，不回写历史失败为成功。

维护义务已写入 [AGENTS.md](../../AGENTS.md)、[贡献规范](../../CONTRIBUTING.md)
及 [PR 检查项](../../.github/pull_request_template.md)。当前是强制流程规则，尚无自动阻断遗漏的 CI；
未来可在 A1 增加文档/证据完整性检查，但自动检查不能代替证据真实性评审。

### 迭代归集表

| 日期 / 范围 | 版本或证据 | 结果与限制 | 本方案沉淀 / 后续 |
| --- | --- | --- | --- |
| 2026-09-25：B3 原生 transport codec | [第七轮证据](../../verification/2026-09-25-b3-contract-alignment.md#第七轮原生-transport-联合编解码) | 生成/漂移、Python 72/72、独立 Swift 编译及往返/拒绝 PASS；Kotlin 工具不可用，编译 NOT_RUN；未接应用 | discriminator 扩展必须阻断旧生成器并复核；同模块 codec 测试不能替代跨模块/应用验收，不为轻量 DTO 任务启动原生重型构建 |
| 2026-09-25：B3 TS 联合类型 | [第六轮证据](../../verification/2026-09-25-b3-contract-alignment.md#第六轮typescript-完整-live-wire-类型) | 首次共享 .ts 导致 rootDir FAIL；改 .d.ts 后生成/漂移、Python 71/71、API 类型正反例 PASS。原生扩展与客户端接入未完成 | DTO 生成需验证必需 nullable 与可选字段差异、联合类型收窄、未知类型拒绝；声明产物不扩张运行时构建边界 |
| 2026-09-25：B3 首批 DTO 生成 | [第五轮证据](../../verification/2026-09-25-b3-contract-alignment.md#第五轮首批-dto-生成与漂移检查) | const 无 type 首跑失败，修正后生成/漂移及 TS 检查 PASS，Python 69/69 PASS；原生编译 NOT_RUN，未接客户端 | 生成必须确定性、CI 检查漂移、未知形状失败；生成成功不等于三端运行时/编解码通过；完整 DTO 待办 |
| 2026-09-25：B3 helper 路由校验 | [第四轮证据](../../verification/2026-09-25-b3-contract-alignment.md#第四轮helper-路由序列化校验) | 类型检查、11/11 PASS，0 skip；实际路由/认证 DB、假 helper，补既有错误响应重试字段。无部署/付费 | CONTRACT-01 覆盖 JSON/SSE 成功、流中失败和流前限流；契约描述既有重试语义，不新增自动重试；DTO/完整 CI 待办 |
| 2026-09-25：B3 helper JSON/SSE 声明 | [第三轮证据](../../verification/2026-09-25-b3-contract-alignment.md#第三轮helper-jsonsse-声明) | 类型检查、6/6 契约测试 PASS；请求 fixture 联查实际 parser，SSE 为合成事件，路由集成待办。无部署/付费 | 区分流前 HTTP 错误、流后事件错误，SSE wire string 与帧对象 schema 分开；运行时字节/递归限制不得冒称已由 schema 完整表达 |
| 2026-09-25：B3 实际路由契约回归 | [B3 第二轮](../../verification/2026-09-25-b3-contract-alignment.md#第二轮实际路由与数据库契约回归) | 类型检查、新用例 1/1 PASS；关联回归 58 PASS、1 SKIP（B2 跨仓），0 FAIL。真实路由 inject + 隔离 DB + 假 provider；无部署/付费 | CONTRACT-01 补实际序列化响应验证，区分 inject/socket/公网；helper/SSE、DTO 与全量 CI 待办，B3 未完成 |
| 2026-09-25：B3 迁移后复测 | [整理及复测记录](../../verification/2026-09-25-worktree-convention.md#mural-历史工作树核查与整理) | 正式 B3 目录类型检查、5/5 契约测试 PASS，0 skip；复用本机缓存，非 clean install；HTTP/DTO 待办 | 已复查，无新增业务规则；跨磁盘迁移使用复制比对及 repair，旧副本禁用 Git 入口，迁移后重新验证 |
| 2026-09-25：旧 Mural 工作树整理 | [逐项核查](../../verification/2026-09-25-worktree-convention.md#mural-历史工作树核查与整理)；main `9b2f485` | 103 文件中 96 与主线一致，7 项差异分类；B1/B2 两提交补丁等价。私有清单原处保留并锁定；两临时工作树移至规范目录，无删除。文档差异检查 PASS | 未跟踪文件须按磁盘内容比较，不能仅凭 git diff 判定删除；保留私有独有资料与历史版本，活动开发回到 B3 |
| 2026-09-25：两仓工作树规范 | [目录规范](../repository-layout.md#local-worktree-convention-2026-09-25)、[核查记录](../../verification/2026-09-25-worktree-convention.md) | 只读核实 Gateway 主 clone 在 DeepTutor、分支 main 且有未提交文档；Worker 同仓。文档差异检查 PASS，无运行时测试、迁移、清理或部署 | 两仓分别以原 clone 为锚点，同级任务工作树；临时目录不作长期开发入口；遗留目录独立审计 |
| 2026-09-25：B3 目录归属更正 | [迁移证据](../../verification/2026-09-25-b3-contract-alignment.md#工作目录迁移)；迁移前后 `12cd1a8` | 核对 common-dir 后，从错误的 DeepTutor 位置移动到 MyProj/vlingo-ai 下；HEAD 一致且工作树干净，其他工作树未改。未重跑应用测试、未部署 | 迁移前必须核对主仓库和项目目录归属，不能沿用历史查找路径；使用 Git worktree move 同步注册信息 |
| 2026-09-25：B3 工作树迁移 | [迁移证据](../../verification/2026-09-25-b3-contract-alignment.md#工作目录迁移)；检查点 `7aaca36` | 11 个变更文件逐一比较一致，持久 B3 工作树已接管分支；旧目录保留。仅文件/Git 核对，应用测试未重跑，未推送、合并或部署 | 临时审查目录不作为长期开发入口；迁移前提交检查点，校验后转移分支，缓存不视作源代码；B3 仍未完成 |
| 2026-09-25：B3 第一轮契约对齐 | [B3 本地证据](../../verification/2026-09-25-b3-contract-alignment.md)；基线 `9b2f485`、未提交候选 | 类型检查、5/5 契约测试 PASS；真实 Gateway 两种 profile 检查 PASS。无运行时修改、部署或付费调用；HTTP 集成、helper/SSE、DTO 与 PR CI 待办，B3 未完成 | 新增 CONTRACT-01；格式与形状均验证，历史兼容字段不代表新增权限；默认必需契约与旧协议兼容检查分开 |
| 2026-09-25：B2 第十二轮 VPS 部署 | [B2 部署证据](../../verification/2026-09-25-b2-control-receipts.md)；API `a81c3ba`、Worker `5c6a2d3` | 异机备份校验、迁移 029、API→Worker/replay、版本/运行状态及 verify PASS；注册记录 1，复查重启 0、待投递队列 0。文档提交/评审及签结待办；无新付费测试，恢复/回滚演练 NOT_RUN | 多目录发布须记录组件实际 Compose 路径，旧部署目录不得误用于全量 up；B7/A2 收敛部署入口。健康/空队列不冒充真实媒体和故障恢复验收 |
| 2026-09-25：B2 第十一轮合并及镜像准备 | [B2 发布标识](../../verification/2026-09-25-b2-control-receipts.md)；API `a81c3ba`、Worker `5c6a2d3` | 两仓最终候选 CI PASS；Worker 镜像及 Linux 卷检查 PASS；最新跨仓定向复测 1/1、0 skip。Worker digest 已发布；VPS 仍为 B1，sudo 需操作员，未备份/迁移/部署 B2 | 已复查，无额外规则变更；沿用第十轮 ACK 唯一性与卷权限规则，区分源码合并/镜像发布/线上运行；B2 未完成 |
| 2026-09-25：B2 第十轮回执删除重插竞态 | [B2 证据第十轮](../../verification/2026-09-25-b2-control-receipts.md)；Worker `12cb69f` / `bee12ec`，API `623c9f9` | 旧实现回归 FAIL，持久版本计数修复后 Worker 40/40、lint/format PASS；API 阶段 CI PASS。新增两容器非 root/持久卷检查，本机无 Docker，执行状态见 Worker CI；VPS 仅只读核对，无迁移或部署，B2 未完成 | USAGE-01 增加跨删除重插/重启的 ACK 唯一性；新增生产等效 Linux 卷权限与跨容器测试；不扩大费用或用户计费范围 |
| 2026-09-25：按阶段及改动范围选择 CI | [范围规则与验证](../../verification/2026-09-25-ci-stage-selection.md) | 阶段切换、手动覆盖、文档跳过和汇总门禁已实现；本地 67 项 Python 测试（含 18 种实际门禁场景）、契约和 YAML 解析 PASS。`8008773` 的 Web/服务端/部署/汇总门禁/契约/扫描 CI PASS，iOS 和 Android 重型任务按范围 SKIPPED；补充回归测试提交仍须核对自身 CI。无需 VPS 部署，无付费测试 | 新增第 4 节阶段规则；旧 Android 模拟器失败仍保留，阶段延期不冒充平台通过；原生发布前必须启用完整平台验证 |
| 2026-09-25：B2 第九轮重放公平性 | [B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)、[Worker 草稿 PR #18](https://github.com/vlingo-ai/model-gateway/pull/18)；Worker `c56c39c` | 修复固定最前 100 条永久失败时饿死后续记录；按会话 ID 分页、回绕，单轮上限仍 100。Worker lint、格式、全套 38/38 非计费测试 PASS，含第 101 条可交付与回绕；更新后的 Worker PR 三项 CI PASS。API 未改，两仓未合并、未发布镜像或部署；**B2 未完成** | USAGE-01 新增永久失败前批的公平交付/回绕回归；永久 4xx 仍需人工对账，待投递非零阻断发布签结。无付费测试或新豁免 |
| 2026-09-25：文档基准对齐候选 | [文档验证记录](../../verification/2026-09-25-documentation-alignment.md)；独立文档工作区 | 将三端范围、Gate 7/B1/B2 证据与本方案整理为独立候选；资源清理私有逐文件清单不进入仓库。100 份候选 Markdown 的 533 个相对链接缺失 0，差异空白和两个脚本语法检查 PASS。首次 CI 密钥扫描把旧 API Git 提交号误报两次；精确白名单后本地完整历史扫描及 CI 复跑均 PASS。跨 PR 审查消除了重复 B2 手册段与同名证据 `add/add` 冲突；最终合并树无冲突。一轮 Android 模拟器任务中断且报单测失败，须重跑确认；未合并、未部署或付费测试；**B2 未完成** | 纯文档迭代也保留验证证据；发布前检查跨 PR 的同文件最终版本，不能将代码 PR 绿色 CI 当作文档已合并或 staging 已验收 |
| 2026-09-25：B2 第八轮 PR CI 修复与复核 | [B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)、[Mural PR #39](https://github.com/vlingo-ai/mural/pull/39)、[Worker PR #18](https://github.com/vlingo-ai/model-gateway/pull/18) | Worker 首次 CI 的 Ruff 格式门禁失败，机械格式化 `672aeb6` 后 [run 36104762272](https://github.com/vlingo-ai/model-gateway/actions/runs/36104762272) 三 job 全绿；本地 37/37。Mural 首次 CI 的部署 Compose config 因 `.env.example` 缺少新必填项失败，补占位符 `93622be`；[run 36104846953](https://github.com/vlingo-ai/mural/actions/runs/36104846953) 的 API server 因 PR 分支遗漏旧解析器测试断言更新而失败。`2c56b8c` 修正后本地类型检查和该文件 8/8 PASS，[run 36105390306](https://github.com/vlingo-ai/mural/actions/runs/36105390306) 的 Web、Swift、API server、部署脚本均 PASS；契约与密钥扫描亦 PASS。本地无 Docker，Compose config 为 NOT_RUN；跨仓 HTTP 用例不在 CI，另有本地 423/423 证据。未合并、未发布镜像、未迁移或部署，**B2 未完成** | 已复核并固化第 5 节 PR 前格式、锁定依赖、Compose 配置和候选 diff/解析器测试门禁；CI 通过与可选跨仓用例执行、真实 Linux 卷权限及 staging 验收分开记。文档基准仍待受控 PR 对齐主线，无新付费或豁免 |
| 2026-09-25：B2 第七轮候选 PR 建立 | [B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)、[Mural 草稿 PR #39](https://github.com/vlingo-ai/mural/pull/39)、[Worker 草稿 PR #18](https://github.com/vlingo-ai/model-gateway/pull/18) | Mural `59c8d7b` + `8e78e41` 与 Worker `4f2e290` 已推送并开立草稿；分别核对同仓 `main` 比较范围为 2 提交/11 文件、1 提交/11 文件。此轮未重跑应用测试，最新本地结果仍为 API 423/423（跨仓用例未跳过）和 Worker 37/37；PR CI、审查、镜像、迁移与 staging 验证待办，**B2 未完成** | 已复查，无新增 USAGE-01 测试规则；发布记录必须分别标明 revision、草稿/CI、合并、镜像 digest 与实际部署状态。当前本方案在独立文档 worktree，仍需受控 PR 对齐主线，不能因代码 PR 建立而略过维护义务 |
| 2026-09-25：B1 staging 部署与非计费核对 | [B1 分次记录](../../verification/2026-09-24-b1-resource-cleanup.md)、[总计划 B1/B7](../web-ios-model-gateway-plan.md) | 迁移 028 已应用；API→Worker 顺序部署；源码、镜像 ID/digest、公开 TLS/健康、Worker 注册日志、DB 活动会话与清理队列、资源快照均核对；`preflight.sh ./.env` 与 `verify.sh ./.env` PASS。无新增真实模型/媒体调用；恢复及回滚演练 NOT_RUN | B1 故障注入以本地/CI 非计费测试签结，staging 运行核对通过；后续 B7/A2 修复默认 `.env` 路径、严格 Worker 注册/不健康失败门禁、隔离恢复与回滚演练；最小权限数据库角色独立加固。与 Gate 7 最终签结分开 |
| 2026-09-25：B2 第一轮控制回执开发 | [B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；Mural 当前 worktree 与独立 Worker B2 worktree，均未合并或部署 | API 类型检查、420/420 全套、Worker lint、27/27 通过；隔离 DB 注入提交前失败、模拟提交后回包丢失且重放 final 不双扣。尚无跨 Worker 重启的待投递保障及晚到 final 证据；**B2 未完成** | USAGE-01 必须分别验证“DB 已提交才 ACK”“相同 final 重试不双扣”“Worker 退出后未 ACK 的 final 可恢复交付”；2xx/内存重试不能替代持久交付。晚到不同 final 不改用户历史扣费，需不可变对账证据。未新增付费、部署或豁免 |
| 2026-09-25：B2 第二轮持久重放与晚到 final | [B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；两仓候选代码，未合并或部署 | API 类型检查及隔离 DB 全套 422/422（含 HTTP 路由模拟契约）；Worker lint 及 31/31；加密队列跨实例重开、503 后重放、版本化 ACK、晚到/冲突 final 登记而不双扣；Compose YAML 与脚本语法通过。完整跨进程 HTTP 矩阵和 staging 尚未验证，**B2 未完成** | USAGE-01 增补“落盘前被杀”与“供应商未产生 final”两个不可保证边界，需保留对账未知项；发布门禁检查重放进程、队列积压、卷 UID/0700、密钥及先 API 后 Worker。未新增付费、部署或豁免 |
| 2026-09-25：B2 第三轮跨进程故障注入 | [同日 B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；两仓仍为本地候选 | Worker lint、36/36 全套；真实子进程和隔离 HTTP/SQLite 替身覆盖提交前 503、提交后丢回包及新进程重放，唯一结算不双扣；较低 final 的乱序修正、缺 ACK 即停模型/作业及只输出积压数的门禁通过。API 最新全套仍 422/422；未连接真实供应商或 staging，**B2 未完成** | USAGE-01 固化“进程重启+乱序高水位+积压为零”的非计费发布检查。HTTP 替身不是实际 API+Worker 端到端，仍需组合故障演练和部署权限核对；没有新豁免 |
| 2026-09-25：B2 第四轮 API 控制器重建 | [同日 B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；候选源码，未合并或部署 | 实际 `HostedVoice` 在提交后重建并重放同值 final，不二次扣；隔离 DB API 类型检查和 422/422 全套 PASS，数据库已停止；Worker 最新 36/36。真实跨仓 HTTP 组合及 VPS 配置仍未验证，**B2 未完成** | 审查 USAGE-01 后无需新增规则；后续将两仓进程级故障注入合并自动化，部署门禁检查队列为空。未新增付费或豁免 |
| 2026-09-25：B2 第五轮回执/密钥安全复查 | [同日 B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；Worker 候选源码 | Worker lint、37/37 全套；回执毫秒必须精确匹配、错误密钥不能解密或清空既有队列。API 未改，最新隔离 DB 全套仍 422/422。两仓均未合并或部署，**B2 未完成** | USAGE-01 回执断言从“至少该值”收紧为“精确该值”；上线/回滚都必须保留队列密钥直到积压清零。无新付费、部署或豁免 |
| 2026-09-25：B2 第六轮跨仓 HTTP 组合及门禁复测 | [同日 B2 分次证据](../../verification/2026-09-25-b2-control-receipts.md)；两仓候选源码，未合并或部署 | 实际 Mural HTTP/HostedVoice/隔离 PostgreSQL 与独立 Worker Python 子进程组合：提交前 5xx 保留队列，恢复后只结算一次；已提交丢回执模拟与 API 控制器/HTTP 重建后重放不双扣。可选跨仓定向 1/1、启用后 API 全套 423/423 零跳过；Worker 37/37，命令行积压门禁非零退出且仅输出数量。LiveKit provider 为本地假实现，未调用 Cloud，**B2 仍未上线完成** | USAGE-01 自动化必须断言跨仓测试实际运行、记两仓 revision；普通 CI 若跳过该用例不可冒充组合验证。门禁复测无需新规则。私有仓库 CI 访问需受限只读凭据，不能沿用个人 Mac 凭据。无新付费/部署/豁免 |
| 2026-09-25：后续统一镜像发布方式的决定 | [总计划 B7/A2](../web-ios-model-gateway-plan.md)、[B1 分次记录](../../verification/2026-09-24-b1-resource-cleanup.md)；[Worker 发布 run](https://github.com/vlingo-ai/model-gateway/actions/runs/36022241117) | 用户采纳：B1 不为形式统一重建现有候选镜像；API 本地构建、Worker 私有 GHCR digest 已完成。作出决定时迁移、VPS 运行和上线核对尚未完成，后续结果见上一行 | 后续将 API 纳入与 Worker 一致的受控 CI 发布；manifest 区分源码、CI run、registry digest、本地 image ID 和实际运行版本；规划专用私有只读拉取身份与失败门禁，不将个人 Mac 凭据作为长期方案 |
| 2026-09-24：B1 候选提交与 PR | [B1 记录](../../verification/2026-09-24-b1-resource-cleanup.md)、[API PR #38](https://github.com/vlingo-ai/mural/pull/38)、[Worker PR #16](https://github.com/vlingo-ai/model-gateway/pull/16) | API `a8d9e60`、Worker `f684d5f` 已合并；API 409 边界补测 8/8、类型检查及 Worker 独立检出 26/26 通过；两仓 CI 全绿；该时点未发布镜像/部署，后续见 9 月 25 日记录 | 发布候选按两仓主线分别冻结；Worker 基于最新主线重建，避免重连补丁在 PR 中重复；先 API 后 Worker 的兼容发布仍需线上核验 |
| 2026-09-24：社区回复复核与 Cloud 拒绝豁免 | [明确授权及监测关闭](../../verification/phase-5-5b/2026-09-24-gate-7-continuation.md#cloud-waiver-decision) | 当前英语 staging 单项 WAIVED，未实测；`livekit` 自动化已删除；文档差异空白、相对链接及围栏检查通过；无新运行时测试、部署或付费调用，最终 Gate 7 签结仍待办 | 条件变化不套用无回复授权；区分社区建议与官方承诺、速率拒绝与资源配额拒绝；后续发布不自动继承豁免 |
| 2026-09-24：B1 部署前核查及备份副本 | [B1 备份后续办](../../verification/2026-09-24-b1-resource-cleanup.md#已完成的部署前核查备份后续办) | DB 未关闭会话 0、运行 image ID 已核对；Mac SHA-256/解密/gzip 由用户确认 PASS；恢复演练及 Cloud 检查未完成，未部署 | 实际 API 用户为 `mural` 超级用户，无需本轮新授权但存在最小权限风险；完善身份核验规则，不新增风险豁免 |
| 2026-09-24：B1 清理队列/本地控制截止候选 | [分次证据与发布待办](../../verification/2026-09-24-b1-resource-cleanup.md)；两个 worktree 未提交增量 | API 419/419、Worker 26/26、类型/lint 通过；该候选检查时未发布/部署；VPS sudo 需用户终端 | 落地部分 LEASE-01/CLEAN-01；记录 SQL 初版失败及修正；沉淀共享连接关闭、未知创建持续清理和 API→Worker 兼容发布顺序；B1 不勾完成 |
| 2026-09-24：Phase 5.5B 英语 staging 复盘 | [续办报告](../../verification/phase-5-5b/2026-09-24-gate-7-continuation.md)，内含部署标识及历次证据 | 功能观测、内部结算、费用与资源统计已归集；计时例外已接受；Cloud 门槛及最终签结仍待办 | 形成第 1–10 节与 A1–A5 自动化设计；初始无声保留调查，不冒充已修复 |
| 2026-09-24：方案与模板建立、维护规则纳入项目 | [报告模板](../../verification/release-verification-template.md)、本节及项目规范；本地未提交文档变更 | 文档差异空白检查、相对文件链接和代码围栏检查通过；无运行时变更，无新付费测试/部署 | 本方案升为最高优先级必维护文档之一；每轮归集、规则提炼、证据关联成为迭代完成条件；CI 强制检查待实现 |
| 2026-09-24：整体计划阶段归属澄清 | [总计划第 5 节](../web-ios-model-gateway-plan.md#5-后续任务与完成条件)及 Gate 7 索引；用户确认后更新 | 文档差异空白与相对文件链接检查通过；仅文档变更，未启动 B1 开发或部署 | 任务分组 B 不等于 Phase 5.5B；B1–B7 位于 5.5B 与 5.5C 之间，可与 Gate 7 收尾并行；保持原验收边界，不追加门槛 |
