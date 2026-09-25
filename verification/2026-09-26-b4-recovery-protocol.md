# B3 签结与 B4 第一轮参考模型

日期：2026-09-26（Asia/Shanghai）。B4 基线 `4a9a26b`。

## B3 签结

用户明确授权后合并 [PR #43](https://github.com/vlingo-ai/mural/pull/43)。
最终候选 `b93debe5393dae445a7acdfb1c81f7509c171dd0` 的 Web、server、deployment 构建、
contracts、gitleaks、scope 与汇总门禁全部 SUCCESS；原生重型任务按阶段 SKIPPED。
[最终 Checks](https://github.com/vlingo-ai/mural/actions/runs/36157536858)。
合并提交 `4a9a26bb60564041095bcc4595a312cc9841fc50`，GitHub 时间 2026-09-25T16:01:43Z。
B3 无业务运行时修改，无需部署；现有 staging 未变。已复查，无新增 B3 验证规则。

## B4 第一轮

工作树位于主 clone 同级 `mural-b4-recovery-protocol`，分支 `codex/b4-recovery-protocol`。
只读梳理 LiveConnection、现有重连测试与架构审查后，先建立共享恢复协议和纯 reducer，
未修改现有连接器、API、Worker 或 native app。模型不发网络请求、不含凭据或用户正文。

新增 10 条共享 JSON 轨迹及 1 条乱序时间测试：初始双向准备、信令断媒体仍可用、
Room 替换后麦克风重发、旧 Room/旧 generation 回调、Stop/close、控制过期、
Agent 丢失、静默与明确媒体丢失。状态模型尚未接入应用，因此不能宣称已修复线上问题。

实际执行：离线 npm ci PASS；Web 48/48 单测 PASS；TypeScript + Vite build PASS。
保留已有 >500 kB chunk 警告。未执行本轮 E2E、真实 SDK 媒体、原生、服务端测试或部署；
未调用真实 LiveKit/OpenAI、未使用付费额度。控制截止的 Web/API 映射尚待设计，不能将
此模型字段视作现有 API 授权或 Worker lease。实时媒体可用性仍须独立验证。

可复用规则：共享轨迹应区分产品 generation 与 Room epoch；Stop 胜过后续恢复事件，
信令丢失不得自动抹去媒体证据或触发 Room 重建；无声音量不等于连接失败。
模型测试只验证状态语义，不替代适配层调用顺序、API 控制权校验或 B5 真实本地媒体链路。

后续：接入 Web 协调器并补各 await 边界的 Stop/迟到结果测试；新 Room 前查询服务端终态，
明确 close 未确认状态及 UI 行为，完成非计费适配测试后再准备运行时发布。
B4 未完成、未开 PR、未合并、未部署。

## 第二轮：Web 适配的两个有界修复

LiveConnection 现在区分 signal-only 与允许 Room 替换的恢复原因；SignalReconnecting
不再固定 5 秒重建 Room，保留 SDK 处理机会；出现 Reconnecting/轨丢失等证据后才允许后备。
原 40 秒恢复截止不延长，持续信令故障到期仍关闭，不无限维持 Active。
核对本地锁定 SDK 源码：信令恢复路径发出 Reconnected，沿用该事件完成准备检查。

getUserMedia 的返回值先保存在局部变量，确认 generation/closed 后才赋给当前会话。
Stop 后返回的旧流立即停轨；新会话建立后旧授权返回也不能覆盖新流。
新增回归覆盖两种授权迟到竞态、signal-only SDK 恢复、升级完整重连、持续失联截止。

执行结果：Web **52/52 PASS**、类型检查 PASS、生产构建 PASS、既有 mock E2E **2/2 PASS**。
保留既有 bundle/Node 警告。mock E2E 是旧 WebRTC/接口替身，不冒充真实 LiveKit 媒体。
没有服务端/Worker 变更，不要求新服务端契约即可运行本轮修复；Web 本身未部署。
候选 UI 行为：仍显示 connecting，但信令单独故障期间不再主动打断健康媒体；
Stop 后迟到麦克风不再保持采集。合并/发布前须再次展示这些变化。

共享 reducer 尚未接 runtime；新 Room 前服务端状态核查、close 确认、其他 await 竞态仍待办。
本轮仅保存本地候选；未开 PR、未合并、未部署、未执行付费测试，B4 不签结。
新增复用规则：媒体权限异步结果必须先验证所有权再赋值；过期结果须主动释放媒体资源。

## 第三轮：恢复状态门禁与关闭确认

Web API 新增现有 GET session status 的调用，采用 B3 生成的状态 DTO；状态/关闭请求
有 5 秒 AbortSignal 上限。Room 后备重建前核对 sessionID、active、有效且未过期 deadline；
401/403/404 终止恢复，临时查询失败在原恢复窗口内重试，不把失败查询视为授权。
查询及旧 Room disconnect 之后检查 generation，Stop 后迟到响应不能再次加入。
这只是重建前快照，不声称消除检查和重入间的服务端竞态或实现完整控制租约。

Stop 立即停本地音轨并关闭传输，移除原 1 秒即 idle 的定时器。收到同会话 closed 才 idle；
失败/非终态保持 closing，提示本地已停但服务端尚未确认，按钮为 Retry closing。
重复点击在请求进行中不重复提交；请求完成仍未确认可显式重试。旧数据通道回调不再覆盖 Stop。
UI 变化已向用户说明；服务端已有 status/close 契约，无新增迁移或服务端代码需求，
部署前仍须核对实际 staging 版本兼容性。

验证：Web **63/63 PASS**、类型检查 PASS；运行时代码生产构建 PASS、mock E2E **2/2 PASS**。
覆盖服务端非 active 状态、无效/过期 deadline、Stop 后状态迟到、关闭失败重试、
HTTP 成功但 closing 非终态、鉴权 GET 路径与超时配置。原有 bundle/Node 警告保留。
未调用真实供应商、未部署、未跑本轮 API 全套或真实 SDK 媒体；没有新豁免。

复用规则：关闭 HTTP 成功不等于 closed；本地停音与服务端关闭分别验证。
未完成：共享模型正式接入、初始/SDK 恢复控制截止协调、旧 WebRTC 创建等剩余 await
竞态、完整 close/状态错误矩阵及实际 staging 发布。B4 不签结。

## 第四轮：LiveKit 接入共享 reducer 与本地截止

共享 reducer 已接入初始/恢复 Active 门禁、信令退化、Room epoch、Stop 与失败；
平台适配仍负责实际 SDK 调用、Room 身份检查和副作用，不把 reducer 当作完整 SDK 状态替代。
创建响应的产品 deadline 按请求发起时墙钟与单调时钟转换；请求耗时消耗剩余额度，
重连不延长期限。本地计时器到期停音并请求关闭。客户端墙钟同步是限制，真正的
授权与计费截止仍由服务器/Worker 执行，不称其为浏览器获得了 Worker lease。

Web **65/65** 单测 PASS、类型及生产构建 PASS，mock E2E **2/2 PASS**。
新增截止前信令恢复不延长产品期限、Stop 后迟到 API 准入关闭且不加入 Room。
保留既有 bundle/Node 警告。无付费调用、无本轮服务端修改；候选未部署。
可复用规则：计时从请求发起的时间基准计算，不在每次恢复时重置产品会话寿命。

剩余：SDK-only 恢复的服务端状态协调、服务端提前缩短期限、旧 WebRTC 异步边界，
以及 Stop 时尚未完成准入/迟到准入关闭失败的可见性（当前仅 best-effort 请求，不冒称确认）。
故障错误矩阵、完整平台适配/PR/CI/发布验收未完成，B4 仍不签结。

## 第五轮：SDK 恢复确认与迟到准入

SDK Reconnected/恢复媒体准备之后同样查询服务端 active/截止；查询期间仍 connecting。
Room 身份、产品 generation 和恢复 revision 均须仍匹配，迟到响应不能重新 Active。
临时查询失败有界重试；终态/鉴权拒绝终止；返回的较短 deadline 缩短本地上限，不延长原期限。
Stop 遇到在途准入保持 closing；拿到会话 ID 后关闭并等待同 ID 的 closed，失败保留 ID 供手动重试。
创建响应丢失则保留未知状态，不以第二次 Stop 清空成 idle；同幂等键查询/重放协调仍待实施。

首轮 6 项失败：旧测试同步假设不再适用、迟到关闭替身返回错误 sessionID，失败用例未清理
离线监听还污染后一项。修正异步断言及准确会话身份后通过；追加负向覆盖而非仅放宽断言。
最终 Web **70/70 PASS**、类型/构建 PASS、mock E2E **2/2 PASS**，既有警告保留。
新增：服务端 closed 阻断 SDK 恢复、状态查询暂时失败后恢复、Stop 后迟到状态、
迟到准入关闭失败/重试、准入响应未知不伪报 idle。

未部署、未执行真实 SDK/供应商测试，无付费调用。本轮只改 Web，复用既有 API；
实际服务器版本和运行时发布仍待核对。B4 不签结。
复用规则：请求返回丢失不等于未准入；未知副作用必须按原幂等身份查证，不能直接重建付费会话。
剩余主要项：未知准入的有界协调、旧 WebRTC await 边界、回归审查及 PR/CI/部署。

## 第六轮：未知准入查询、旧 WebRTC 边界与候选回归

核对服务端发现原幂等键只防重复创建，重试返回 409，不返回原会话；未采用重放 POST。
新增鉴权 GET `/v1/live/requests/:id`（原 UUID 请求键），仅查询当前账户，返回既有状态 DTO，
可查 closed，不返回 provider token/配置。无 schema migration。null 是快照未知，不能自动放行新 Start。
Web 保存原请求键，创建最多等待 30 秒；Stop 时在途请求返回后确认关闭，响应丢失则每次
显式 Retry closing 发一个 5 秒上限只读查询，找到原会话后关闭。查询 null/失败仍 closing，
禁止重建另一付费会话；不自动轮询、不无限发请求。浏览器刷新后的持久恢复不在此内存机制内。

旧 WebRTC 的 offer/local SDP/ICE/创建/remote SDP 逐段检查 generation，旧轨/数据通道回调被隔离；
两 transport 共用准入跟踪。文字发送跨历史写入等待后重新验证 generation、session 和 Room，
Stop 后不再发送旧消息或启动模型任务。SDK 状态查询跨 Room 替换的迟到结果也不能阻挡新 Room 再确认。

验证：Web **74/74 PASS**、类型/生产构建 PASS、mock E2E **2/2 PASS**；
API 类型/生产构建 PASS，全套 **428/428 PASS、0 skip**，启用 B2 私有 Worker 本地跨仓用例。
全套后增加实际 HTTP 跨账户与非法 UUID 断言，定向 **1/1 PASS**。
生成漂移、跨端轻量检查、git diff --check PASS。无原生重型构建或真实供应商调用。

失败保留：全套首跑契约路径清单未同步、测试错误预期 close 立即 closed；定向再跑因假 provider
未发 final 仍超时。补路径及假 final 事件后定向与全套通过，没有把 incomplete 改写成 closed。
一次只读 sed 用错工作目录失败，重新在 repo 根目录读取；未影响源码或运行状态。

影响：本轮新增服务端接口，因此必须 API→Web 兼容部署；runbook 已更新。UI 变化已告知用户。
当前仅本地候选，尚未 PR/CI/合并/部署，不将 B4 勾为已上线完成。
发布剩余：云端 CI/审查、备份与版本核验、API→Edge 部署、非计费上线核验；真实媒体链路属于 B5/另行授权。
限制：无服务端原子取消 tombstone；null 永远不是取消证明；本地截止依赖客户端初始墙钟，
服务端/Worker 仍是控制权来源；音轨准备不等于实际双向可闻验证。未新增豁免。
