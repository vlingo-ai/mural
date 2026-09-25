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
