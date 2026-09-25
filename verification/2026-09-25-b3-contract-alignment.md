# B3 契约对齐：2026-09-25

## 范围与状态

基线 Mural `9b2f485902b9d8a724b1cc0f28757625cee1d0c8`，分支
`codex/b3-contract-alignment`。第一轮已保存本地检查点 `7aaca36`，B3 未完成。
未更改 API/Worker 运行时、UI、语言范围、计费规则或 staging 配置。
本轮无需部署：修改限于契约、开发检查工具、测试及文档；没有新付费测试。

## 第一轮实现

### 工作目录迁移

首次迁移错误地沿用历史 DeepTutor 查找路径；用户指出后重新核对 Git common-dir，
确认 Mural 项目归属为 `/Volumes/Kingston/MyProj/vlingo-ai`。
B3 现已通过 `git worktree move` 更正到该目录下的 `mural-b3-contract-alignment`。
首次迁移的 11 个变更文件逐文件比较一致；本次更正前后 HEAD 均为 `12cd1a8`，工作树干净；
迁移后分支为 `codex/b3-contract-alignment`。旧工作树保留在 `7aaca36` 的 detached HEAD，
不再用于继续开发，尚未删除。忽略的依赖/构建缓存未复制；后续在新目录安装依赖。
本次仅验证 Git/文件迁移一致性，未重跑应用测试、推送、合并或部署。
复用规则：临时审查目录不得作为后续开发与正式文档的长期入口；
先核对 Git 主仓库及项目归属，再保存检查点、校验内容、转移工作树。
DeepTutor 下错误放置的 B3 目录已随工作树移动，不额外保留平行副本；
临时 B2 检查点目录仍保留，清理另行执行。

- 对照 `app.ts`、`hosted-voice.ts`、`live-provider.ts` 修正 Live 请求顶层 SDP、
  WebRTC/LiveKit transport、创建响应不含 state、账本可选字段和状态响应。
- 补 capabilities 与 nullable current-session；close 请求为空 JSON 对象。
- 旧 instructions/history 兼容输入如实记录；instructions 标为 deprecated，
  不把现有兼容字段解释为新客户端权限。API 支持语言不等于 UI 开放语言。
- Gateway 检查默认 Responses，显式 legacy-live 额外要求旧 Live schema/sideband；
  共享 protocol/usage 校验保留，未知 profile 拒绝。
- 直接声明已锁定的 AJV 8.20.0/ajv-formats 3.0.1 开发依赖，
  避免测试依赖 Fastify 偶然提供的传递依赖。锁文件复用既有版本，无运行时依赖升级。

## 实际验证

在 `services/api`：

```bash
npm run check
node --import tsx --test tests/contracts.test.ts tests/gateway-contract-profile.test.ts
```

类型检查 PASS；5 tests PASS，0 fail、0 skip。包含 UUID、日期、URI 格式拒绝，
两种 transport、旧嵌套 transport 拒绝、缺 room token、私有字段泄露、nullable current，
以及缺 Responses/usage/legacy event schema 和未知 profile 拒绝。
本地实际 Gateway contract checkout 的 Responses 与 legacy-live 检查均 PASS。
本轮前段 Python 脚本测试 67/67 PASS；不是三端运行时测试。

## 限制及后续

1. 第一轮为合成 fixture；第二轮已补实际路由与隔离 DB 校验（见下），非公网部署验证。
2. helper JSON/SSE 第三轮补声明和 fixture，第四轮补实际路由 schema 校验（假 helper）；不是完整 provider 集成。内部 Worker 控制协议不能混入公开 bearer API。
3. UTF-8 字节上限、非空白文本和业务条件不能仅靠 JSON 字符长度证明，须保留运行时测试。
4. 三端 DTO 生成尚未实施；不启用原生功能或重型平台发布测试。
5. 全量 API、Web、PR CI、审查与合并尚待后续候选验证；不沿用 B2 CI 为 B3 证明。

复用规则已归集到[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)
的 CONTRACT-01 与迭代表；[总计划](../docs/web-ios-model-gateway-plan.md)保留 B3 未完成。

## 第二轮：实际路由与数据库契约回归

在正式 B3 工作树新增 hosted.test.ts 用例，通过 Fastify inject 调用实际路由处理器，
使用隔离 PostgreSQL schema、真实认证与 HostedVoice、假 LiveKit 或本地 WebRTC provider。
这不是公网/socket 层 API 测试，也不是 Cloud/媒体验收。
覆盖两种 transport 的 capabilities（匿名/登录）、current 空/非空、创建、状态、关闭，
验证公开响应不泄露 providerSessionID，并拒绝旧嵌套 transport 请求。
测试 fixture 仅增加暴露既有 helper 实例，不改应用运行时。

执行结果：类型检查 PASS；定向新增用例 1/1 PASS、0 skip；
hosted.test.ts、contracts.test.ts、gateway-contract-profile.test.ts 关联回归合计
59 项，58 PASS、0 FAIL、1 SKIP。跳过项为 B2 跨仓 Worker 子进程用例，
未配置其 Python 环境，本轮不冒称重新验证该链路。无真实 provider 调用。
测试后停止专用本地 PostgreSQL。helper/SSE、DTO 生成和全量候选 CI 仍待办。
复用发现：契约回归须从实际路由序列化后的响应断言，不能仅比较手写对象；
明确 inject、socket、公网三个验证层级，保留跳过项。

## 第三轮：helper JSON/SSE 声明

补 `/v1/live/sessions/{sessionID}/helpers`，默认 JSON 与显式 Accept SSE 分开描述。
requestID 为应用去重身份；assessment 需要 schema、其他 purpose 不得带 schema，
search=true 只允许 delegation/topic。instructions 是现有兼容输入，不新增权限。
记录字节上限、schema 深度/节点与文本校验由运行时执行；OpenAPI 不是该递归子集的完整验证器。
SSE 的 wire body 为字符串，每帧 JSON 对象另定义 delta/completed/error union；
流前 HTTP 错误、流后错误事件及断线不能盲目重试均明确。

类型检查 PASS，契约与 Gateway profile 测试 6/6 PASS、0 skip。
请求拒绝 fixture 同时调用真实 parseHostedHelperInput；事件仍为合成 fixture，
尚未验证实际 helper HTTP/SSE 响应与 schema 一致。未改运行时、未部署、无付费调用。
下一步补 helper 路由集成、三端 DTO 生成和候选完整验证，B3 未完成。

## 第四轮：helper 路由序列化校验

扩展已有 hosted-http.test.ts：实际 Fastify inject 路由、真实隔离认证 DB，
helper service 为假实现。校验 JSON、SSE delta/completed、部分输出后 error，
大小写与 q 值 Accept 协商、q=0/非法 q 回退 JSON。流前 429 仍是 JSON 错误。
核查发现 ErrorResponse 缺既有 helper_session_limit 的 retryable/retryAfterMilliseconds，
补可选字段并验证实际序列化结果；没有增加自动重试或修改服务器行为。

类型检查 PASS；hosted-http、contracts、gateway-contract-profile 三文件合计
11/11 PASS，0 FAIL、0 SKIP。测试后停止专用 PostgreSQL；无真实 Cloud/模型调用。
本轮不代表实际 HostedHelpers 计费端到端或 socket/媒体测试；DTO 与全量 CI 仍待完成。

## 第五轮：首批 DTO 生成与漂移检查

新增无第三方依赖 Python 生成器与 Contracts CI --check。首批只选择四个已审查的
primitive object：两种 transport、capabilities、helper usage，生成 TS/Swift/Kotlin。
文件位于 shared/contracts/generated，未接入客户端运行时，不启用任何原生能力。
使用所选 schema 内容摘要，不使用时间戳；遇到未支持字段形状失败而非降级为任意类型。

首跑因 const 字段无显式 type 被拒绝；补明确的 string/bool const 类型推导后通过。
生成/漂移检查 PASS；Python 全套 69/69 PASS；生成 TS 单独 tsc --noEmit PASS。
Swift/Kotlin 编译与编解码 NOT_RUN；两端 enum/const 暂为基础类型，不能声称运行时约束等价。
复杂联合类型、完整 DTO、共享 round-trip fixtures、客户端接入及 PR CI 尚待完成。
无运行时修改、部署或付费调用。B3 未完成。

## 第六轮：TypeScript 完整 Live wire 类型

TS 生成范围扩展至 transport union、LiveSession/Status/current、历史与创建请求、
helper result/event、ErrorResponse。递归处理受审查本地 ref、object/array、oneOf/anyOf、
可选与 nullable；未知 ref/开放对象/未审查 allOf 拒绝生成。原生生成范围不变。
新增编译反例：缺 room token、缺 current.session、缺必需 nullable cost、
缺 completed.result、未知 transport 必须报错，transport discriminator 可正确收窄。

首次把共享 .ts 引入 API 测试触发 rootDir 错误；改为纯声明 live.d.ts，
不扩大 API 构建根目录、不输出新运行时代码。旧生成 live.ts 被声明文件替代，Git 可恢复。
修正后生成/漂移检查 PASS，Python 71/71 PASS，API tsc（含负例）PASS。
这些类型不是 runtime validators；Swift/Kotlin 联合编解码及客户端接入仍未实现。
无部署/付费调用。B3 尚未完成，下一步原生类型/编解码及候选完整验证。

## 第七轮：原生 transport 联合编解码

Swift enum 和 Kotlin sealed class/custom JSON serializer 显式按 type 分派两种 transport，
拒绝未知/缺失类型；编码分支与内部 type 不匹配时拒绝。生成器锁定已审查 discriminator，
schema 新增类型时失败要求复核，不静默忽略。未接入任何原生应用。

生成/漂移检查、Python 72/72 PASS；swiftc 独立编译生成 DTO 与
shared/contracts/tests/TransportRoundTrip.swift PASS，运行后两种往返、未知类型、
缺 SDP/token、null/缺 type、编码类型错配检查全部 PASS。
本机未找到 kotlinc；Kotlin 编译与 round-trip NOT_RUN，未为此启动 Android 重型构建。
Swift 测试与生成文件同模块编译，不证明跨模块公开构造或真实 iOS 应用兼容。
这些 codec 不是完整 JSON Schema 验证器，额外字段及文本格式规则仍依赖边界校验。
完整原生 session/status/helper DTO、共享测试矩阵、客户端采用和最终 CI 仍待完成。
本轮无服务端运行时修改，无需部署，无付费调用。B3 未完成。

## 第八轮：完整 Live DTO 候选与本地验证

三端生成统一覆盖 13 个 Live schema 根节点及其内嵌对象：transport、capabilities、
usage、session/status/current、history/create、helper result/event、error。
原生 object 编解码保留 required nullable 与 optional presence 的差异，enum/const 双向校验，
Swift 有公开构造器。生成器拒绝未支持形状/引用或不一致 discriminator，不静默降级。
这不是全 API SDK：旧 helper request 的递归用户 schema、其他账户/model-task 未纳入生成。
客户端采用与平台应用验收仍属于后续适配，不在本轮启用原生功能。

通过现有 Gradle 缓存找到 Kotlin 编译器/序列化插件，新增独立 JVM 检查脚本，
无需 Gradle/Android 应用/模拟器。Swift 与 Kotlin 共享 24 条 JSON fixture：两 transport、
Live 创建、status/current 的 missing/null、history 角色/内容、helper usage/result/events、
错误响应和 enum/const 拒绝。大额费用保持十进制字符串；API AJV 验证同一组 fixture。
原生 codec 不是完整 schema validator：格式、字节/数量限制仍由 API 校验；额外字段为向前兼容忽略。

本地执行：

- API npm ci --ignore-scripts --offline、类型检查、构建 PASS。
- 全量 API 首跑跨仓用例 FAIL：操作时 PYTHONPATH 错多一层 src，未找到 mural_livekit；
  修正为 Worker 根目录后全量通过。clean-install 后再次全量 **428/428 PASS，0 skip**，
  包括 B2 实际 API HTTP + Worker 子进程故障用例；全部专用 DB/假 provider。
- Web 离线 npm ci、37/37 单测、构建、2/2 mock Playwright PASS；已有大 bundle 警告保留，
  不冒充真实 LiveKit 媒体/原生应用验收。
- Python 72/72、生成漂移、轻量跨端内容检查 PASS。
- Swift/Kotlin 独立编译及共享 fixture 检查实际执行；Kotlin JDK 26 兼容性警告保留，
  不是编译失败；native 重型任务未运行。

无需部署：所有变更为文档、schema、生成工具、隔离生成产物和测试，未改 app/API/Worker runtime。
本轮无 UI/UX 改动、迁移、新 feature 或付费请求。PR/CI/审查尚待完成，不宣称已合并。
可复用规则：共享 fixture 同时验证 API schema 与独立原生 codec；nullable 字段应检查
round-trip 后仍保留 null 或缺失，不以能解码代替语义一致。

### 发布权限边界

2026-09-25：本地候选验证完成，专用 PostgreSQL 已停止。尝试将候选推送到
`vlingo-ai/mural` 的 `codex/b3-contract-alignment` 被安全审批拦截，要求用户明确批准
本轮源码/测试/文档上传目的地。未绕过，未上传、未创建 PR、未运行本轮远端 CI 或合并。
改为仅保存本地提交。B3 本地开发完成不等于 PR/CI/合并签结完成。
复用规则：成功、流中失败与流前限流错误均需契约断言，重试字段缺失不能解释为允许重试。

## 第九轮：授权上传与镜像构建边界修正

用户明确授权后，候选 `6a6958e` 已推送并创建 [PR #43](https://github.com/vlingo-ai/mural/pull/43)。
首轮云端 Web、contracts、gitleaks PASS；deployment 镜像检查 FAIL：
API Docker 上下文不含仓库级 shared，新增测试类型引用无法解析。
修正为独立 tsconfig.build.json 仅编译 src；npm run check 仍包含全部测试类型断言。
Docker 不再复制测试目录，运行入口仍为 dist/src/main.js，未改变运行时业务代码。
本地完整类型检查及新生产构建 PASS；镜像复验以修正后云端 CI 为准。
复用规则：仓库全量类型检查与受限 Docker 上下文构建分别验证，测试依赖不可隐式进入生产构建。
无合并、部署或付费调用；不能将 CI 镜像构建称为部署成功。
