# 两仓工作树规范核查 — 2026-09-25

用户要求 Model Gateway（含 Worker）遵循与 Mural 相同的同级任务工作树规范。
规则见 [repository-layout](../docs/repository-layout.md#local-worktree-convention-2026-09-25)。

只读检查 worktree list、分支、status 与 common-dir：

- Gateway 主 clone：`/Volumes/Kingston/DeepTutor/model-gateway`，main，HEAD `6a3f187`。
- 主 clone 存在既有文档修改与未跟踪基准文档，全部保留；本轮未编辑 Gateway。
- DeepTutor 下已有 model-gateway-b2-control、model-gateway-phase-5-5-livekit。
- 临时位置仍登记 B2 fair-replay 与 B1 Worker 工作树。
- 三个旧临时工作树登记标为 prunable：release-adfc723、streaming-observability、
  visualizer-streaming-diagnosis。此标记不证明提交或资料可丢弃。
- 未移动、删除、prune、切换分支、推送或部署。仅更新 Mural 中的跨仓规范与验证记录。

本轮无应用代码变更，不重跑运行时测试；文档 git diff --check PASS。
遗留工作树的独有修改、提交合并状态、私有文件保留情况仍需逐项审计。

## Mural 历史工作树核查与整理

刷新 origin/main 后，基线仍为 `9b2f485`。
架构审查工作树 `9b62/mural` 的 103 个变更文件（包含未跟踪文件）中，
96 个文件内容与 main 逐字节一致；7 个不同文件为部署手册、构建指南、总计划、
文档索引、清理记录、发布验证方案、B2 证据。除私有清理记录外，差异为旧状态、
历史路径索引或缺少后续主线增补；不以旧版本覆盖 main。
清理记录含未发布的私有逐文件清单，保留原处，不提交其正文。
`git cherry origin/main HEAD` 确认 `64e17c2`、`330b125` 均有主线等价补丁。
该工作树连同缓存、未提交资料全部保留，并用 worktree lock 防止误清理；
它不是当前开发/部署入口。本轮不强行迁移当前任务绑定的 Codex 工作目录。

跨磁盘 git worktree move 首次失败（Cross-device link），未移动内容。
随后完整复制、diff -qr 核对，再用 git worktree repair 更新注册位置：

- docs-review 移至 MyProj/vlingo-ai/mural-docs-review，HEAD `61e07d9` 已为 main 祖先；
  原分支与忽略的 Finder 文件保留，转为历史参考。
- b2-review 移至 MyProj/vlingo-ai/mural-b2-checkpoint，detached `7aaca36`；
  是当前 B3 祖先，保留依赖缓存用于迁移后验证，不作开发入口。

原临时目录保留为恢复副本，不再作为注册工作树使用，禁止从旧副本执行 Git 写操作。
旧副本的 `.git` 已改名为 `.git-retired`，防止误用指向新目录的 Git 元数据。
没有删除工作树、分支、私有文件或缓存。活动开发入口仅为同级 B3 工作树。
检查范围为上述三个 Mural 工作树；Gateway 遗留清理仍是独立待办。

整理后继续 B3：从保留检查点复制既有 node_modules 缓存，在正式 B3 目录运行
`npm run check` 与两份契约测试：类型检查 PASS，5/5 PASS、0 skip。
依赖缓存复用不是 clean-install 验证；实际 HTTP 集成及 DTO 工作仍待完成。
