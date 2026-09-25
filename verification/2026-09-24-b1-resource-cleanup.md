# B1 — 持久资源清理与 Worker 本地控制截止（2026-09-24）

状态：**B1 已部署至英语 staging，非计费上线核对通过；故障路径由本地/CI 非计费测试覆盖。未执行新增真实媒体/模型调用、完整数据库恢复演练或真实 Cloud 故障注入。**
本轮位于 Phase 5.5B 与 5.5C 之间，不追溯增加 Gate 7 门槛。
依据：[开发基准](../docs/web-ios-model-gateway-plan.md)、[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)。

## 范围与版本

- Mural：基线 `d9cda0d`，B1 API 提交 `64e17c2998ea96de3d9e813977a6757ca849d945`，
  [PR #38](https://github.com/vlingo-ai/mural/pull/38) 已合并到主线
  `a8d9e60e27526cd41ed142bcc28b86dfe0e23d04`；原工作区其他文档改动未混入该提交。
- Worker：`/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit`，
  原工作区 `codex/phase-5-5b-worker-reconnect`，B1 提交 `351092c36f91582a40475615cb83e967d998bb08`；
  主线随后合并了重连修复。为避免重复差异，从最新主线 `76789ec` 独立检出并移入 B1，
  [PR #16](https://github.com/vlingo-ai/model-gateway/pull/16) 的提交为
  `5eb1f25`，已合并到主线 `f684d5fe9790c390b6fe81595b17982a3587db72`；
  独立检出 26/26 测试通过。原工作区的文档改动未受影响。
- 同目录主 checkout `model-gateway`（`6a3f187`）未用于本次 Worker 代码修改。
- 两仓原有文档改动保留。没有 UI/语言/价格变化，没有访问真实模型或消耗 Cloud 配额。
- VPS 只读核查 release HEAD 为 `525925e63922efab7a9a25d9920b18e622388748`；
  `sudo -n docker ps` 返回 `a password is required`。随后操作员在 VPS 终端完成了镜像/会话核查，结果见下文；release HEAD 本身不等于运行镜像证明。

## 实现及边界

1. 新迁移 `028_hosted_resource_cleanup.sql`：房间名在 CreateRoom 前落库；
   `armed → pending → confirmed` 与结算独立。每轮至多 10 个，失败按 5/10/20/40/60 秒退避；
   API 重启、DB 确认失败后幂等重试，不因 hosted session 已 closed 而漏清理。
2. 只把成功删除或精确 `404 + not_found` 视作删除成功；503/权限错误仍待重试。
   SDK 控制调用限制 5 秒且关闭区域 failover，重试归持久队列管理。
   发布前复核补充：CreateRoom `409/already_exists` 不能证明房间缺席，必须保留预留和清理意图；已加入回归测试。
3. CreateRoom 结果不明且未持久确认 provider ID 时，暂时不存在不代表之后不会迟到创建：
   即使一次删除成功，队列仍 pending，每 60 秒继续；保留原预留，需明确对账处置，不能擅自退款/补扣。
   本进程仍在创建中的 ID 不进入清理，避免关闭/创建竞态。
4. 控制 usage/heartbeat 响应新增 `leaseMilliseconds`：等待当前 usage 队列完成后读取 DB，
   仅 active 且没有关闭请求才授予，取持久 lease、业务 deadline 与 30 秒的最小剩余值；关闭返回 0。
   这是 B1 必需的权限确认，不等于 B2 的全部事件去重/final 持久确认已经完成。
5. Worker 首次明确获准前不创建模型连接；启动控制不可用最多重试 30 秒。
   每 5 秒续约；本地单调时钟从请求发送时扣除传输耗时，迟到响应不能复活过期租约。
   独立 watchdog 不等待卡住的续约请求；截止后关闭模型专有 HTTP/WebSocket 连接并请求 job 退出。
   浏览器掉线本身不等于控制租约过期，保留媒体重连宽限。
6. LiveKit 1.8.2 可能使用共享 HTTP session，原模型 `aclose()` 未必关闭它。
   本轮显式持有独立 transport；升级 SDK 必须复查此适配。AgentSession 优雅关闭最多等待 5 秒，
   超时也关闭模型 transport；这不是 provider 最终账单或操作系统卡死时的绝对硬截止保证。

## 自动化结果

| 检查 | 本轮结果 |
| --- | --- |
| API `npm run check` | PASS |
| API 全套测试，隔离本机 PostgreSQL 17，`TEST_DATABASE_URL` 指向专用 `_test` 库 | **419 passed，0 failed，0 skipped** |
| Worker `.venv/bin/ruff check --no-cache mural_livekit tests` | PASS |
| Worker `.venv/bin/pytest -q -p no:cacheprovider` | **26 passed** |
| 两仓 `git diff --check` | PASS |
| 本轮文档相对文件链接、Worker 新增/修改代码格式 | PASS |

API 新增 7 项回归：active 不误删、closed 清理失败/重启/退避/不双扣、lease 过期结算与继续清理、
未知创建继续持有与清理、创建/关闭竞态、清理确认 DB 失败后的重试、真实 SDK DeleteRoom 503/精确 404、
授权等待落库并不超过 funded deadline（部分断言合并在同一测试）。
发布前又补充 CreateRoom `409/already_exists` 不能当作缺席的非计费回归：
`npm run check` 与 LiveKit provider 单元测试 8/8 通过；CI 随后对最终 API 提交运行 server 全套并通过。
Worker 独立检出测试 26/26，CI 的 Worker 测试及 Docker 构建通过；两仓其余要求的 CI 均通过。
Worker 新增 13 项（含参数化）：网络耗时扣减、过期不复活、0 撤销、续约卡住仍截止、
首次失联不启动、成功续约、旧 API/畸形 lease 拒绝、入口断控退出、模型连接独占与关闭。
测试使用假凭证/假 provider、真实本地 DB/已安装 SDK；**不是完整本地 LiveKit 媒体演练（B5），也不是真实 Cloud 验收。**

初次失败记录：沙箱禁止本地 PostgreSQL socket/shared memory，批准后使用隔离临时数据库；
四项初版测试暴露 UUID/text 共用 SQL 参数推断冲突，改为显式 cast 后通过。
Worker 首次 lint 暴露宽泛异常捕获与 import 格式问题，已修正；缓存写限制通过禁用缓存规避。
最终全量测试在上述修正后重新运行，没有把失败/跳过冒充通过。
测试结束后停止专用临时 PostgreSQL；测试数据目录和日志保留，未改动用户数据库。

## 发布前待办及回滚

### 已完成的部署前核查（备份后续办）

证据来源：操作员在 VPS 执行指定只读命令，助手读取当前任务终端；Mac 校验由操作员回复 `ok, pass` 确认。

- 5 个容器在运行；API/Gateway/数据库显示 healthy，Edge/Worker 仅为 Up，不据此认定业务健康。
- DB `unclosed_sessions=0`，只证明该次查询无未关闭记录；LiveKit 房间/参与者仍待查，实际部署前需重新查。
- 运行镜像 **本地 image ID**（不是 registry digest）：
  API `sha256:e06df747c27218f63db741aa85b3208010a5ee6eb77512707925919adbcfdff1`；
  Worker `sha256:522cb206d7ac837a74dd6fd87972f2b038786ac968d1b1d67bcffcb6fab30ea5`。
  尚未新增回滚标签、保存配置或发布新镜像。
- API 配置实际用户名 `mural`；`pg_roles` 确认 `rolsuper/rolcreatedb/rolcreaterole` 均为 true，
  `public.hosted_sessions` owner 为 `mural`；新 cleanup 表尚不存在。
  因而本环境不是先前假设的受限 runtime role，B1 当前无需额外 GRANT。
  API 使用超级用户是新确认的权限风险，需单独最小权限加固；未擅改角色，也未获得生产风险豁免。
- 已创建 `postgres-20260924T041400Z.sql.gz.age`：VPS 原件在既有 deploy 目录的 `backups/`，
  受限下载副本在 `/home/vlingo-admin/`，Mac 副本在既有 `.config/vlingo-recovery/backups/`。
- VPS 下载副本 SHA-256：`586b33d34760541606ded8738d6262f1141d9a8c2c900d9784a7408121cf76e2`。
  用户确认 Mac SHA-256 比对 OK，age 解密及 gzip 完整性 PASS；未保存明文。
  **数据库恢复演练仍为 NOT_RUN**，不将完整性检查写成可恢复性已验证。
- 合并后的发布前复查：`active-sessions.sh` 无输出，五个既有容器仍在运行；API/Gateway/数据库
  显示 healthy，Edge/Worker 仅显示 Up。第一轮命令误粘为单行未执行，随后以绝对路径单独重跑成功。
- 新增发布前加密备份 `postgres-20260924T152523Z.sql.gz.age`，VPS 原件保留，另有
  `/home/vlingo-admin/` 受限下载副本及 Mac 既有恢复目录副本。两端 SHA-256 一致：
  `8dec5b03a752b73c01aa23c7fae6b51769c5aad5d433ac5dc803b9df3f72c882`；
  Mac `age --decrypt | gzip -t` 为 PASS，不落地明文 SQL。恢复演练仍为 NOT_RUN。
- VPS Docker root/user 配置均未包含 `ghcr.io` 登录条目。现有私有 Worker GHCR 包元数据
  `repository=null`；不能假设 `model-gateway` 的 `GITHUB_TOKEN` 对既有包有写权限。
  为避免在 VPS 存放个人令牌，已创建仅可在 main 手动触发的
  [Worker 发布工作流 PR #17](https://github.com/vlingo-ai/model-gateway/pull/17)，三项 CI 通过后
  合并至 `a565eb5f375a1da2fa208c1161d138a3ed23d4cb`。合并当时尚未触发构建/发布；
  随后包管理员完成所需的 Actions 包访问授权，手动发布结果见下条。PR 合并本身不等于镜像已发布。
  包仍为 private，VPS 拉取新 digest 还需临时受控认证；不得为省事公开包或把个人令牌写进仓库。
- 操作员在 VPS 构建 `vlingo-speaking-live-api:a8d9e60` 成功，未替换正在运行的 API。
  Worker 手动发布 [Actions run 36022241117](https://github.com/vlingo-ai/model-gateway/actions/runs/36022241117)
  为 success，源码 `a565eb5f375a1da2fa208c1161d138a3ed23d4cb`，镜像固定为
  `ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:8ba743722b0075bf6a7465d73908a1fea7289c58380c75e9c96a6b97e7e7d5f3`。
  Mac 现有 GitHub 凭据对该 digest 的 GHCR manifest HEAD 为 HTTP 200；这只证明 Mac 可读取，
  不代表 VPS 已拉取或启动，且未把凭据传到 VPS。
- VPS 旧发布源码仍为 `525925e63922efab7a9a25d9920b18e622388748`，工作树干净；
  已在 `/home/vlingo-admin/releases/rollback-b1-20260924/` 保存 mode 0600 的
  `.env` 和 `compose.yaml` 回滚副本，`cmp` 与现行文件一致。随后 VPS 发布源码切换至
  `a8d9e60e27526cd41ed142bcc28b86dfe0e23d04`；切换后再次 `cmp` 一致、工作树干净。
  尚未替换运行镜像。
- 此前仅更新证据/方案；随后两仓 B1 代码已形成上述提交及 PR，CI 全部通过。
  首次合并尝试因缺少明确授权被自动审批拒绝；用户之后明确授权合并和删除候选远端分支，
  PR #38 和 #16 分别于 2026-09-24 合并，实际主线 SHA 如上。
  合并当时 VPS Mural 发布目录仍在旧 SHA `525925e`，仅获取了新主线对象；
  之后源码已切换至上述 `a8d9e60`，但尚未重启或替换运行镜像。
  VPS 无法直接认证私有 Worker 仓库，故从合并 SHA 生成源码包并传输到独立目录，
  `/home/vlingo-admin/releases/worker-b1-f684d5f.tar.gz` 的 SHA-256 为
  `89e25c6f9d86f861d8e0ab94e864ac7ad58123597d636ae308a26420cfd4a36a`，
  VPS 校验通过，解压目录为 `/home/vlingo-admin/releases/model-gateway-b1/workers/livekit-gpt-live`。
  在源码包传输当时未发布新镜像、迁移或重启；随后仅发布了上述 Worker 候选镜像，
  仍未迁移或重启，也没有新增真实模型调用。

2026-09-25 B1 构建决策：已验证的 API VPS 本地构建候选镜像与 Worker 私有 GHCR digest
保持不变，不为统一构建形式而重新构建。下一轮 B7/A2 才将 API 纳入与 Worker 一致的
受控 CI 测试、构建、私有发布、registry digest 固定及 VPS 只读拉取验证流程；
详见[迭代计划](../docs/web-ios-model-gateway-plan.md)与[发布上线测试与验证方案](../docs/operations/release-verification-plan.md)。
该决策作出时仅同步文档，没有部署、迁移或执行计费测试；后续部署见下文。

2026-09-25 B1 继续部署前证据：

- VPS release HEAD 仍为 `a8d9e60e27526cd41ed142bcc28b86dfe0e23d04` 且工作树干净；
  运行中仍是旧 API `vlingo-speaking-live-api:5f71474339ffcc2689319e7ecd8ebff2afcd2561`
  与旧 Worker image ID `522cb206d7ac`。数据库、API、Gateway 显示 healthy；Edge/Worker 仅 Up。
- `active-sessions.sh` 两次无输出；调用旧 API 容器中的 LiveKit SDK `listRooms()` 返回
  `LIVEKIT_ROOMS=0`。这只是当时的快照，真正替换容器前仍须复查。
- 使用 Mac 现有 GitHub 凭据经 SSH 写入 VPS `/dev/shm` 的 mode 0600 临时 FIFO；
  Docker 使用另一个 `/dev/shm` 临时配置目录登录 GHCR。固定 Worker digest
  `sha256:8ba743722b0075bf6a7465d73908a1fea7289c58380c75e9c96a6b97e7e7d5f3`
  拉取及 image inspect 成功；随后临时 Docker 配置目录与 FIFO 均确认删除。
  没有更改 VPS 持久 Docker 登录配置，也没有启动候选 Worker。
- 新加密备份 `postgres-20260924T162649Z.sql.gz.age` 已在 VPS 保留原件，
  VPS 用户下载副本与 Mac 既有恢复目录副本的 SHA-256 均为
  `39a40067dba76e7dedde70100daebf543f0131f5334946700c3aff6f2f016a45`；
  Mac 上 mode 0600、age 解密和 gzip 完整性检查 PASS，不落地明文。
  完整 PostgreSQL 恢复演练仍为 NOT_RUN。
- 当前 `.env` 与既有回滚副本、当前 `compose.yaml` 与回滚副本均 `cmp` 一致；
  候选 API image ID 为 `sha256:7068e98f2e8bc8f1d9770f270eddc58836dcaa8e358a3391dce6288281638189`。
  `preflight.sh ./.env` 为 PASS；默认调用 `preflight.sh` 因 `/bin/sh` 的 `. .env`
  路径解析失败，属于脚本调用缺陷，后续需修正，不能将首次失败记为配置失败。
- 迁移前 DB 为 `applied=28`、最新 `027_livekit_worker_lease.sql`、028 未应用且清理表不存在。
  再次确认活动会话 0 后，使用候选 API 镜像的一次性 `migrate` 容器执行，输出
  `Mural schema ready.`；独立只读复核为 `applied=29 migration_028=1
  cleanup_table=hosted_resource_cleanup`。首次迁移命令中的末尾核对因 shell 引号冲突未执行，
  独立查询才是数据库状态证据。此时 API/Worker 运行镜像仍未替换。

## 2026-09-25 B1 部署与非计费上线核对

- 在替换 API、Worker 前分别重查 `active-sessions.sh`，均无未关闭会话；部署前调用现行 LiveKit SDK `listRooms()` 返回 0。此为操作时点快照，不是全程无人使用的保证。
- 按兼容顺序先 API、后 Worker，均使用 `docker compose --env-file .env up -d --no-deps --no-build --pull never --wait`。VPS 发布源码 `a8d9e60e27526cd41ed142bcc28b86dfe0e23d04`，工作树干净；当前 API 为本地候选 tag `vlingo-speaking-live-api:a8d9e60`，其 image ID 为 `sha256:7068e98f2e8bc8f1d9770f270eddc58836dcaa8e358a3391dce6288281638189`。**此 ID 不是 registry digest。**
- Worker 当前运行固定 GHCR digest `ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:8ba743722b0075bf6a7465d73908a1fea7289c58380c75e9c96a6b97e7e7d5f3`；容器 `running`、重启次数 0；近 10 分钟日志计数 `LOG_LINES=9 REGISTERED_EVENTS=1 ERROR_CANDIDATES=0`。注册事件计数与业务媒体/模型可用性不是同一证据。
- 迁移 028 已由独立只读查询证实，`applied=29 migration_028=1 cleanup_table=hosted_resource_cleanup`；现行 `mural` 角色对清理表 `SELECT/INSERT/UPDATE` 均可用。发布后 `cleanup_total=0 armed=0 pending=0 confirmed=0`；`active-sessions.sh` 再次无输出。空队列只证明当前无待清理项，不证明 503 重试在 Cloud 上发生过。
- 使用显式参数 `./.env` 执行 `preflight.sh` 与 `verify.sh` 均 PASS；后者输出 `verify: PASS (public TLS, health, disabled audio capability, containers, sanitized logs)`。公开 `/healthz` 为 HTTP 200、TLS 校验正常；API、数据库、Gateway 为 healthy，Worker、Edge 为 running。`verify.sh` 的 PASS 不代替严格的 Worker 注册/真实媒体门禁；本轮另有上述注册日志计数。
- 一次 `docker stats --no-stream` 快照：Worker CPU 0.54%、内存 475.8 MiB / 3.542 GiB；API 0.09%、32.59 MiB；Edge 0%、13.11 MiB；Gateway 5.72%、76.46 MiB；数据库 0.12%、38.45 MiB。它不是长时间容量/延迟验证。
- 回滚配置 `.env`、`compose.yaml` 的 mode 0600 副本在 `/home/vlingo-admin/releases/rollback-b1-20260924/`；旧 API tag `vlingo-speaking-live-api:5f71474339ffcc2689319e7ecd8ebff2afcd2561` 与旧 Worker digest `ghcr.io/vlingo-ai/livekit-gpt-live-worker@sha256:522cb206d7ac837a74dd6fd87972f2b038786ac968d1b1d67bcffcb6fab30ea5` 已在切换前确认仍可 inspect。回滚顺序为先旧 Worker、后旧 API；不删除迁移 028 数据。**未执行实际回滚演练。**
- 最新部署前加密备份 `postgres-20260924T162649Z.sql.gz.age`：VPS 原件及 Mac 恢复目录副本保留，SHA-256 均为 `39a40067dba76e7dedde70100daebf543f0131f5334946700c3aff6f2f016a45`；Mac age 解密管道与 gzip 完整性 PASS，未落地明文 SQL。**完整 PostgreSQL 恢复演练 NOT_RUN。**
- 未启动新增真实模型/媒体会话，未购买容量、未触发真实 Cloud 配额拒绝。旧有英语 staging Gate 7 状态及其单项豁免独立记录，本 B1 部署不等于 Gate 7 最终签结。

### 保留限制与后续任务

- 对其他使用受限 runtime role 的环境，新表需要 `SELECT, INSERT, UPDATE`（含 `FOR UPDATE`），不需要 DELETE。当前 staging 使用 `mural` 超级用户是最小权限风险，不能由本次通过推断其他环境权限正确。
- `preflight.sh`/`verify.sh` 默认 `.env` 参数在 POSIX `/bin/sh` 下可能因 `. .env` 解析失败；本次使用显式 `./.env` 通过。后续修正默认路径并增加脚本测试，属于发布工程加固。
- 历史会话无可靠 provider/environment 标签，**迁移未自动回填或清扫历史房间**；后续若需处理历史未清资源，先审核并明确列目标，不批量猜测删除。
- 真媒体/新增付费测试仍需独立授权；清理长期 pending 的主动告警、严格 Worker 注册门禁、隔离恢复及回滚演练属于后续发布工程加固，当前用日志及只读队列核查。

只读队列汇总（迁移后，使用既有 DB 操作入口；不输出 token/对话）：

```sql
SELECT c.state, count(*) AS resources, max(c.attempts) AS max_attempts,
       min(c.created_at) AS oldest_intent, min(c.next_attempt_at) AS next_attempt
FROM hosted_resource_cleanup c
JOIN hosted_sessions h ON h.id=c.session_id
WHERE c.state='pending' OR (c.state='armed' AND h.state IN ('closed','closing','incomplete'))
GROUP BY c.state;
```

剩余 B2：所有 usage/final 提交结果的明确持久 ACK、去重与补偿；
B6：Worker 最终历史可靠交付。上述内容尚未由 B1 替代，也未签为上线完成。
