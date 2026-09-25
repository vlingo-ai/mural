# B2 分次证据：控制回执与最终用量（2026-09-25）

状态：**B2 按开发、隔离故障测试及 staging 非计费部署范围签结；API、Worker 与 replay 已部署，迁移 029、部署后验证及运行复查 PASS。** 下文各轮状态是当时快照；最新部署证据见第十二轮。不代表本轮真实媒体或 staging 故障注入验收通过。

## 第十二轮：VPS 部署及非计费验证

2026-09-25，操作员在 VPS 执行命令，助手核对终端输出；Mac 解密结果由操作员提供。

- 数据库备份 `postgres-20260925T091344Z.sql.gz.age` 已复制到 Mac；两端 SHA-256
  `0ff48d8e1f3452e46716684944d1df36a639cb2b1783b938903fcf5f4c33352f` 一致，age 解密与 gzip 校验 PASS。完整恢复演练 NOT_RUN。
- 旧 API/Worker/Edge 已添加 `rollback-before-b2-20260925` 标签；旧 `.env` 和 `compose.yaml`
  保存在 VPS root-only `/root/mural-before-b2-20260925.CK9SYQ`，不提交内容。
- 原目录 HEAD `a8d9e60` 干净，保留不动。独立目录 `/home/vlingo-admin/releases/mural-b2-a81c3ba`
  固定 API 源码 `a81c3ba2ee1f722495c1c20db566928121fc0b5a`；本机构建及运行 image ID 均为
  `sha256:891500ef35fcab2b690ce6d7380c120bf45879c9264e9b75d61d1e937e38cbdc`。这不是 registry 发布证据。
- Worker/replay 固定 GHCR digest 和运行 ID 均为
  `sha256:8e9f070289f60086b5df4066c548657b85c43da8b4111958c37158ef153c3f3d`。
  临时 Mac 凭据经 SSH/FIFO 用于拉取，内存目录清理后独立检查 PASS；永久 Docker 登录未改。
- 队列目录 `/var/lib/vlingo-speaking-live/worker-outbox` 为 UID/GID 10001、0700；候选配置独立生成 32-byte base64 key，不输出或提交密钥。后续必须保留该 key 与队列。
- `preflight.sh ./.env` PASS；迁移前 DB 无非 closed 会话，LiveKit `listRooms()` 为 0。
  迁移前最新 028，执行后 `Mural schema ready.`；独立核对 029 登记、新表存在、immutable trigger 状态 O。
- 按 API → Worker/replay 顺序部署。API 版本标签正确、healthy；Worker/replay 均 running、restart=0。
  数据库、Gateway、Edge 未重建。`verify.sh ./.env` 输出 `durable_control_pending=0` 和 PASS，
  包含公网 TLS/HTTP、Gateway 关闭音频能力与有限日志模式扫描。
- 后续核对：新 Worker 最近 300 行日志检出 1 条注册记录（证明曾注册，不证明持续 Cloud 可达）；
  API/Worker/replay 再次均为 running、restart=0，队列再次为 0。包含新队列密钥的候选配置
  以 root-only `b2.env` 单独保留在上述回滚目录，未覆盖旧 `.env`。
- 限制：脚本 PASS 不证明真实媒体正常，也不是完整日志安全审计；无新增付费会话，
  staging 故障注入、数据库恢复和实际回滚演练 NOT_RUN。供应商未产生 final 或落盘前崩溃仍不可保证最终用量完整，不能将未知值补成零或追扣用户。
- 复盘：多目录部署需按组件记录实际 Compose 路径，禁止后续误用旧目录执行全量 up；
  B7/A2 应补受控部署入口及自动化发布清单，当前仍由操作员分步执行。

文档收尾：本轮仅更新部署证据、总计划、runbook 与发布验证方案，不改变运行时代码或 UI，
无需再次部署。文档评审保留“实际部署/非计费核验通过”与“真实媒体未测试”的区别；
四份改动文档的 77 个相对链接、代码围栏及 `git diff --check` PASS；此轮未重跑应用测试。
[文档 PR #42](https://github.com/vlingo-ai/mural/pull/42) 首轮契约、密钥扫描及两条范围/汇总门禁 PASS；重型平台任务按文档范围 SKIPPED，不算应用测试 PASS。最终修订仍需自身 CI 通过后合并。
原回滚目录中的 Compose 含相对路径，不应直接在 `/root` 目录执行全量恢复，回滚需显式核对
project directory、项目名、镜像和服务范围，并保留 B2 队列及其密钥。

范围服从[项目 B2 基准](../docs/web-ios-model-gateway-plan.md)；不改变英语 staging Gate 7 的独立状态。

## 本轮代码范围

- Mural API 当前 worktree：`services/api/src/livekit/live-provider.ts` 只验证并解析受信事件，不在数据库提交前通过内存 listener 假确认；`HostedVoice.acceptTrustedEvent()` 等待 usage/final 事务，再由 `controlReceipt()` 从数据库核对已观察毫秒和最终状态。HTTP 2xx 回执新增 `committed: true` 与 `observedMilliseconds`；旧 API 回执没有该字段，新 Worker 必须拒绝当作持久成功。
- 已关闭会话的同值 final 重试可确认而不再次结算；小于等于已记录值的迟到 usage 可确认但不重新续租；不同 final 明确返回对账错误，不覆写已结算账本。
- Worker 独立 worktree `/Volumes/Kingston/DeepTutor/model-gateway-b2-control`，从 `origin/main` 的 `a565eb5f375a1da2fa208c1161d138a3ed23d4cb` 创建，未触碰旧 `model-gateway-phase-5-5-livekit` 的既有文档改动。Worker 对 usage/final 和 heartbeat 验证持久回执；usage/final 对网络超时、408/429、5xx 最多 3 次有界重试，4xx 及缺失回执不视为成功。未修改模型/语言/价格/UI。

## 非计费验证结果

| 检查 | 结果与边界 |
| --- | --- |
| API `npm run check` | PASS |
| LiveKit provider 单元测试 | 8/8 PASS；解析行为不再等于持久 ACK |
| API B2 隔离 PostgreSQL 故障测试 | PASS：事务提交前触发器报错时无成功回执、预留未扣；解除后重试只结算一次；模拟提交后丢失 HTTP 回包而重放同值 final，余额不二次扣；不同 final 返回对账错误 |
| API 全套 `npm test` | **420 passed，0 failed，0 skipped**；使用专用 `mural_b2_test` 数据库与临时 PostgreSQL，未连接 staging 或真实供应商。结束后临时数据库进程已停止，测试目录保留 |
| Worker `ruff check --no-cache` | PASS |
| Worker `pytest -q -p no:cacheprovider` | **27 passed**；包括 503 后同 payload 重试和旧 API 缺少持久回执时拒绝 |
| 两仓 `git diff --check` | PASS |

首次 API 单元测试在受限沙箱中因 `tsx` IPC socket `EPERM` 未运行；获准在本机执行后 8/8 通过。该权限错误不是代码测试失败。未使用真实 OpenAI/LiveKit key、未新增付费会话。

## 第二轮增量（同日）

- API 增加迁移 `029_hosted_final_reconciliation.sql`：已结算之后才收到的 final 或不同 final，仅以不可变、按会话去重的毫秒数证据登记；不覆写用户原扣费。回执区分已结算的 `observedMilliseconds` 与本次已持久接收的 `acknowledgedMilliseconds`。隔离 PostgreSQL 覆盖“晚到 final”“冲突 final”“不二次扣费”。
- Worker 增加加密 SQLite 待投递队列与独立重放进程：先落盘再发 usage/final，收到可校验的持久回执才按版本清理；跨进程重新打开后仍可重放。队列目录限定 Worker UID、0700；数据库文件 0600；令牌以 AES-GCM 加密；记录不含对话正文。容量上限 1000 条，超限为显式失败，不能静默丢弃。
- 候选 Compose 增加独立重放服务与共享持久卷；候选 preflight 验证专用 32 字节密钥格式、卷绝对路径与 UID 10001/0700，verify 检查重放容器。**这些配置仅在 worktree，未写入 VPS 环境，未启动服务。**
- 本地非计费结果：API `npm run check` PASS、隔离 PostgreSQL 全套 **422/422 PASS**（新增 HTTP 路由拒绝未提交 final、已提交后返回持久回执）；Worker `ruff check` PASS、**31/31 PASS**（新增队列重开、版本化 ACK、密文检查、权限、先失败后重放）；候选 shell 语法、Compose YAML 解析及 Mural `git diff --check` PASS。隔离数据库已停止，目录保留。首次 Python 依赖同步受沙箱网络限制，获准安装锁定依赖后通过；未连接 staging 或供应商。

## 第二轮时尚未满足的 B2 门槛（历史快照）

以下是第二轮结束时的记录；后续跨仓验证、PR 与 CI 进展见第三至八轮，不能把本节的“尚未提交”当作当前状态。仍未解决的运行态门槛须以最新增量及发布方案核对。

1. 队列只保障**已经落盘**的 usage/final。若供应商从未产生最终用量，或 Worker 在回调任务落盘前突然被杀，仍可能只有前一次累计用量；这需要运营对账未知项及额外的进程终止注入验证，不能声称数学意义上“所有 final 绝不丢失”。
2. HTTP 路由回执形状和未提交时的 409 已通过模拟服务测试；仍需独立进程重启及 API/Worker 组合故障矩阵。目前的“API 提交后回包丢失”由同值重放模拟，跨进程重放通过 Worker 单元测试，二者尚未联成完整端到端实验。旧 Worker→新 API 可兼容；新 Worker→旧 API 因缺少 `committed`/`acknowledgedMilliseconds` 必须 fail-closed，部署必须 API 先于 Worker。
3. 候选卷/密钥尚未在 VPS 准备；上线前须核对迁移权限、活动会话、加密备份、回滚镜像和运行态队列积压；不对当前 staging 擅自部署。
4. 两仓尚未提交/合并、没有构建新镜像、未取 VPS 活动会话快照或新加密备份、未部署。后续遵循 runbook，不能以本地 PASS 冒充 staging 运行或真实媒体验收。

## 第三轮增量：跨进程重放与失败门禁（2026-09-25）

- 新增真实子进程测试，子进程使用候选 Worker 的真实 SQLite 队列与 HTTP 客户端，父进程提供隔离的 HTTP/SQLite 控制端替身。分别模拟前三次请求**提交前 503**与**提交后断开、丢失回包**；首次子进程退出后队列仍保留，第二个新进程从磁盘重放，最终队列清空，替身账本只有一个唯一结算行。此测试没有真实供应商请求，也**不能代替实际 Mural API 与 Worker 的端到端重启测试**。
- 复查发现较低的迟到 final 可能被已落盘的较高 usage 覆盖，导致 final 标记遗失；已改为以累计最高水位保留数值，同时保持 final 标记。新增乱序测试。
- Worker 的后台 usage 报告若未获持久回执，现在关闭模型连接并停止作业；新增故障测试证明顺序为模型关闭先于作业终止。该路径是安全失败，不能误报为正常会话完成。
- 新增只输出 `durable_control_pending=N` 的队列状态命令；候选 `verify.sh` 要求重放服务运行且队列为空，任何待投递或无法读取均阻断发布签结。不会输出会话 ID、令牌或正文。
- 本轮 Worker lint PASS、**36/36** 全套测试 PASS；Mural 候选 shell 语法/补丁检查 PASS。前轮 API 隔离 DB **422/422** 仍是最新全套结果，第三轮未改 API 运行代码。所有状态仍为**本地候选**。

第三轮可复用规则：USAGE-01 的“持久交付”必须分别覆盖提交前失败、提交后丢回包、重放进程重启、乱序累计值以及发布时队列积压；只看到重放容器 `running` 不等于积压为零。当前仍缺真实 API+Worker 组合故障演练、生产等效权限/卷检查及部署验证，故不勾 B2 完成。

## 第四轮增量：实际 API 控制器重建（2026-09-25）

在隔离 PostgreSQL 的 B2 final 测试中，于 final 事务提交后重建 `HostedVoice` 控制器，再重放同值 final；确认回执仍由持久数据库状态给出，余额不二次扣。API `npm run check` PASS，隔离数据库全套 **422/422 PASS**；测试 PostgreSQL 已停止、目录保留。Worker 最新全套 **36/36 PASS**。这加强了真实 API 组件的重启验证，但尚未把真实 API HTTP 服务与独立 Worker 子进程联成一个实验，也未在 VPS 检查目录 UID、密钥和镜像。**未合并、未部署、无真实供应商调用。**

本轮复用审查：USAGE-01 既有的“提交后重启重放不双扣”用例已覆盖新增发现，无需另增验收规则；后续自动化仍应把两个仓的进程级故障注入合并为单一可重复任务，并将 `outbox_status --require-empty` 作为部署门禁。

## 第五轮增量：回执精确匹配与密钥连续性（2026-09-25）

Worker 现在要求 `acknowledgedMilliseconds` **等于**本次报告毫秒值，不能以更大的累计值冒充本次 final 已持久接收；错误加密密钥无法解密旧队列，原记录保持不变。Worker lint 与全套 **37/37 PASS**，补丁格式 PASS。API 代码未改，最新隔离 DB 全套仍 **422/422 PASS**。该发现已转为 USAGE-01 回执断言与密钥保留门禁；仍未合并、未部署、未做真实模型/Cloud 调用。

## 第六轮增量：实际两仓 HTTP 组合（2026-09-25）

- 新增可选的跨仓测试 `services/api/tests/hosted.test.ts`，需显式提供 `TEST_DATABASE_URL`、`B2_WORKER_PYTHON`、`B2_WORKER_PYTHONPATH`。使用实际 Mural `createApp` 内部 HTTP 路由、`HostedVoice` 与隔离 PostgreSQL，以及独立 Python 子进程运行候选 Worker 的真实加密 SQLite 队列和重放客户端。LiveKit provider 的鉴权/建房部分为本地假实现，不调用 Cloud 或 OpenAI。
- 注入最终结算事务提交前的 PostgreSQL trigger 错误：Worker 子进程收到 HTTP 5xx 后退出，队列仍有一条、余额/预留未变；解除故障后由新进程重放，队列清零且恰好结算一次。随后重新落盘相同 final 模拟“已提交但 Worker 未收到回执”，重建实际 API 控制器和 HTTP 服务，新进程重放后仍无二次扣费。
- 独立定向测试 **1/1 PASS**；启用跨仓测试后的 API 隔离数据库全套 **423/423 PASS、0 skip**，`npm run check` PASS；Worker 最新 lint 与全套 **37/37 PASS**。隔离 PostgreSQL 已停止，测试临时队列目录由测试清理。没有使用真实供应商密钥或付费会话。
- 同轮追加命令行门禁回归：实际运行 `outbox_status --require-empty`，有一条待投递时以非零码退出，仅输出 `durable_control_pending=1`，不输出令牌；Worker 全套重跑仍 **37/37 PASS**。本项未引出新规则，沿用第三轮“积压为零才能签结”的门禁。
- 仍须在候选镜像、真实 Linux UID/0700 卷、迁移 029 与 staging 服务组合上验证。HTTP 测试采用假 LiveKit provider，因此不证明 Cloud 建房/调度或真实媒体；环境变量未提供时该可选用例会跳过，不能把普通 CI 的通过误写为跨仓组合测试已执行。

复用规则：USAGE-01 的跨仓自动化报告必须列出该可选用例**实际执行**而非跳过，并记录两仓 revision、隔离 DB 与 Worker Python 来源。后续 CI 若要自动运行，需要获得对私有 Worker 仓库的受限只读访问；现阶段不可声称 CI 已实现，也不得把个人凭据长期放入 CI。

本轮可复用规则：**控制通道 2xx 只有在数据库提交后、回执包含可校验的持久观察值时才代表 ACK；进程内重试与跨进程最终交付应分别验收。** 对应[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)的 USAGE-01 与迭代归集表。

## 第七轮增量：候选分支与审查入口（2026-09-25）

- Mural 从已合并 B1 的 `main` 建立独立候选 `codex/b2-durable-control`，提交 `59c8d7b`（API/迁移/测试）与 `8e78e41`（运行手册与本证据初版），开立[草稿 PR #39](https://github.com/vlingo-ai/mural/pull/39)。对 `main` 为 2 个提交、11 个文件；未把原文档 worktree 的大量未提交改动混入代码 PR。
- Worker 从其 `main` 建立 `codex/b2-control-receipts`，提交 `4f2e290`，开立[草稿 PR #18](https://github.com/vlingo-ai/model-gateway/pull/18)。对 `main` 为 1 个提交、11 个文件。两 PR 均标记不应在互相兼容性审查及文档基准对齐前合并，也不授权发布镜像或部署。
- 本轮只验证 GitHub 比较页的目标仓库、基线、变更范围和草稿状态；创建 PR 没有重新运行应用测试。最新本地非计费测试仍为上一轮 API 423/423（可选跨仓用例实际运行）和 Worker 37/37。PR CI 的最终结论、正式代码审查、候选镜像、真实 Linux 卷/权限、迁移及 staging 核对均待办。

本轮复用审查：没有新增测试用例规则；继续要求发布报告同时列出两仓不可变 revision、PR/CI 状态与实际部署 digest，不能把草稿 PR 或本地 PASS 写成已合并、已部署或已验收。必维护的[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)已登记本轮；其文档基准仍需经独立受控 PR 对齐主线。

## 第八轮增量：PR CI 失败、修正及重新验证（2026-09-25）

- Worker [草稿 PR #18](https://github.com/vlingo-ai/model-gateway/pull/18) 首次 CI [run 36104391324](https://github.com/vlingo-ai/model-gateway/actions/runs/36104391324) 的 `livekit-worker` 因 7 个文件不符 `ruff format --check` 而失败，另外两个 job 通过。仅做机械格式化，提交 `672aeb6`；本地格式检查、lint、非计费 37/37 测试通过。最初受限沙箱的 2 个 localhost socket 测试失败为绑定权限限制，获准在本机复测后 37/37 通过。[新 run 36104762272](https://github.com/vlingo-ai/model-gateway/actions/runs/36104762272) 的 `gateway`、`responses-image`、`livekit-worker` 均 PASS。
- Mural [草稿 PR #39](https://github.com/vlingo-ai/mural/pull/39) 首次 CI [run 36104518437](https://github.com/vlingo-ai/mural/actions/runs/36104518437) 的 `phase-5-5b-deployment` 因候选 Compose 所需 `WORKER_OUTBOX_HOST_DIR` 未列在 `.env.example` 而失败。示例文件现增补无秘密的目录及 `WORKER_OUTBOX_KEY` 占位值，提交 `93622be`；本地 shell 语法和补丁检查 PASS。本机没有 Docker，未本地运行 Compose config。[run 36104846953](https://github.com/vlingo-ai/mural/actions/runs/36104846953) 的部署脚本、Web、Swift core、密钥扫描、契约检查 PASS，但 `server` 测试 #269 失败：PR 分支遗漏了与 B2 解析/持久化职责分离相应的旧断言更新。已在 `2c56b8c` 修正该测试：解析 `usage`/`heartbeat` 不应直接调用旧监听回调，断开后仍可解析可信 `session.closed`。本地 `npm run check` 与该文件 8/8 非计费测试 PASS；`tsx` CLI 在受限沙箱创建本地 IPC 管道被拒，改用 `node --import tsx --test` 执行。新 [run 36105390306](https://github.com/vlingo-ai/mural/actions/runs/36105390306) 的 Web、Swift core、API `server`、部署脚本均 PASS；同一提交的契约检查 [run 36105390353](https://github.com/vlingo-ai/mural/actions/runs/36105390353) 与密钥扫描 [run 36105390269](https://github.com/vlingo-ai/mural/actions/runs/36105390269) PASS。后续证据文档提交仍需重新确认 PR checks。
- 这些 CI 运行不执行可选跨仓 API/Worker HTTP 组合用例；该用例实际执行的证据仍是第六轮隔离 PostgreSQL 的 423/423 本地结果。CI 成功不代表真实 Linux 卷/UID、迁移 029、供应商链路、VPS 部署或线上验收已通过。

复用规则：候选 PR 前按目标 CI 精确运行 formatter、锁定依赖测试及 Compose config；新增必填变量同时更新无秘密的 `.env.example`。涉及控制事件投递时，须同步检查解析器单测和持久化回执测试，避免 PR 准备时遗漏只在原工作树出现的测试改动。若本机缺 Docker，明确标为 NOT_RUN 并以 PR CI 的实际结果补证。该规则已提升至[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)，后续仍需审查、文档主线对齐与受控部署。**B2 未完成。**

## 第九轮增量：重放队列公平性审查（2026-09-25）

- 代码复核发现独立 replay 每轮固定查询 `rowid` 最前 100 条；若它们长期收到 4xx 或无法确认，后续待投递记录即使可成功提交也可能永远得不到重试。旧实现仍有容量上限和非空门禁，但不构成公平交付。
- Worker 在独立临时工作区改为按稳定会话 ID 分页，重放进程每轮推进游标，末尾回绕；每轮仍最多处理 100 条，不扩大单轮请求量或记录敏感信息。提交 `c56c39c` 已快进推送至[Worker 草稿 PR #18](https://github.com/vlingo-ai/model-gateway/pull/18)。
- 新增非计费回归：前 100 条持续收到 409 时，第 101 条在下一轮获持久 ACK 并清理；再下一轮游标回绕旧记录。Worker lint、格式门禁与全套 **38/38 PASS**。首次受限沙箱中只有需绑定 localhost 的旧有两个故障注入测试因权限失败；获准在本机完整复测后 38/38 PASS。更新后的 Worker PR #18 三项 CI（`gateway`、`responses-image`、`livekit-worker`）均 PASS。
- 本轮没有更改 API 合同、计费价格或部署配置；未进行真实供应商调用、迁移、镜像发布或 VPS 改动。公平轮询不代表永久 4xx 已自动对账：这些记录仍需操作员判读，`outbox_status --require-empty` 仍须阻断发布签结。

复用规则：USAGE-01 除重启/不双扣外，还需证明永久失败的前批记录不会饿死后续可交付记录，且分页回绕不会遗忘旧记录。此规则已纳入发布验证方案；**B2 仍未完成**。

## 第十轮增量：删除重插后的迟到回执（2026-09-25）

- 文档/CI 基准 PR #40 已合入 Mural `main`（`f56cc97`）；B2 通过 `623c9f9` 合并主线，
  新阶段规则下 [Checks](https://github.com/vlingo-ai/mural/actions/runs/36115361393)、契约与密钥扫描 PASS，
  原生重型任务 SKIPPED。这个结果不表示 iOS/Android 已验收。
- 复查发现 Worker 和 replay 可同时持有旧记录版本 1；Worker 先收到确认并删除旧记录后，
  新 final 重插又分配版本 1，随后 replay 的旧确认会误删尚未确认的新 final（删除重插竞态）。
  新回归首先在旧实现上 FAIL：预期保留新 final，实际队列为空。
- Worker `12cb69f` 将版本号改为同一 SQLite 事务内分配的持久递增计数，删除记录不清除计数；
  新初始化时从既有 pending 最大版本开始。两项新增回归覆盖容器/进程重新打开后的迟到确认和旧表升级。
  修复后 Worker 全套 **40/40 PASS**、lint/format/差异检查 PASS；没有连接真实供应商。
- Worker `bee12ec` 增加候选镜像 CI：两个独立容器共享 10001:10001、0700 临时目录，
  `--network none`、只读根文件系统、无 capabilities；验证跨容器重开、0600 DB、令牌密文、
  迟到 ACK 不删除新 final、最终队列为空。脚本仅用公开合成数据，无 LiveKit/OpenAI 密钥。
  本机无 Docker，该项本地 NOT_RUN；实际执行结果以
  [Worker CI](https://github.com/vlingo-ai/model-gateway/actions/runs/36116012511) 为准。
- VPS 只读预检：源码仍为 B1 `a8d9e60`，Git 工作目录干净；SSH 管理员可用，
  非交互 sudo 不可用。尚未执行 B2 活跃会话查询、备份、迁移、环境配置或容器变更。

复用规则：USAGE-01 的回执身份必须跨“删除→重新插入→进程重启”保持唯一，
不能只验证同一行更新时的版本递增。CI 镜像验证应覆盖与部署一致的 UID、目录权限、
只读根文件系统及跨容器卷保留；通过后仍需核对 VPS 实际配置和积压。

## 第十一轮：候选合并、镜像与发布前交接（2026-09-25）

| 对象 | 不可变标识 / 结果 |
| --- | --- |
| Mural PR #39 | 合并提交 `a81c3ba2ee1f722495c1c20db566928121fc0b5a` |
| Mural 最终候选 CI | `0e2fdfb` 的 [Checks 36116168762](https://github.com/vlingo-ai/mural/actions/runs/36116168762) 及契约/扫描 PASS；原生任务按阶段 SKIPPED |
| Worker PR #18 | 合并提交 `5c6a2d3738cdbb8db7b66869373b0a028e6a2cd6` |
| Worker 候选 CI | `bee12ec` 的 [36116012511](https://github.com/vlingo-ai/model-gateway/actions/runs/36116012511) 全部 PASS，含真实 Linux 镜像两容器 UID/0700/只读根文件系统测试 |
| Worker 镜像发布 | [36116373635](https://github.com/vlingo-ai/model-gateway/actions/runs/36116373635) PASS，源码为上述合并提交 |
| Worker registry digest | `ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:8e9f070289f60086b5df4066c548657b85c43da8b4111958c37158ef153c3f3d` |
| 最新跨仓定向复测 | API `0e2fdfb` + Worker `bee12ec`，实际 API HTTP、独立 Worker 子进程、专用 PostgreSQL：**1/1 PASS、0 skip**；假 LiveKit，无付费调用；专用临时 PostgreSQL 已停止 |

发布前仍需：VPS 活跃会话确认、新加密备份及异机校验、保留旧镜像和配置、准备 outbox 专用密钥与
10001/0700 目录、拉取固定 Worker digest、构建固定 API 源码镜像，再按 migration/API→Worker/replay
顺序执行。迁移是新增表；回滚不得删除待对账数据或 outbox 密钥/持久卷。
VPS 当前仍为 B1 `a8d9e60`，非交互 sudo 不可用，需操作员在 VPS 终端执行受控步骤。
合并/发布不是部署，也不证明真实媒体或新的付费用量验收通过。

本轮复用审查：第十轮的 USAGE-01 规则已覆盖新发现，无额外规则变化；把真实镜像测试和最新跨仓
复测结果补齐。继续保留供应商未产生 final 或回调落盘前进程被杀的已知边界，不声明所有 final 永不丢失。
