# B3 契约对齐：2026-09-25

## 范围与状态

基线 Mural `9b2f485902b9d8a724b1cc0f28757625cee1d0c8`，分支
`codex/b3-contract-alignment`。当前为未提交本地候选，B3 未完成。
未更改 API/Worker 运行时、UI、语言范围、计费规则或 staging 配置。
本轮无需部署：修改限于契约、开发检查工具、测试及文档；没有新付费测试。

## 第一轮实现

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

1. 当前 JSON-schema 是合成 fixture 验证，实际 HTTP + 隔离 DB 响应校验待补。
2. helper JSON/SSE 尚未纳入；内部 Worker 控制协议不能混入公开 bearer API。
3. UTF-8 字节上限、非空白文本和业务条件不能仅靠 JSON 字符长度证明，须保留运行时测试。
4. 三端 DTO 生成尚未实施；不启用原生功能或重型平台发布测试。
5. 全量 API、Web、PR CI、审查与合并尚待后续候选验证；不沿用 B2 CI 为 B3 证明。

复用规则已归集到[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)
的 CONTRACT-01 与迭代表；[总计划](../docs/web-ios-model-gateway-plan.md)保留 B3 未完成。
