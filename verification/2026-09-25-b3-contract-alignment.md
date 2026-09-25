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
2. helper JSON/SSE 已在第三轮补声明和 fixture；实际 helper 路由 schema 验证待补。内部 Worker 控制协议不能混入公开 bearer API。
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
