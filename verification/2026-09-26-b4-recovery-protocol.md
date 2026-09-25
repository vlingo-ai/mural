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
