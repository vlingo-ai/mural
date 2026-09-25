# Gate 4 — Google Web OAuth staging client (2026-09-21)

<!-- baseline-scope:2026-09-23 -->
> 历史证据：保留当时部署、测试和观察，不追改结果。旧 pending 项由最新基准及本目录索引统一管理；普通话已暂停，英语 Gate 7 仍未通过。本文件不是当前部署命令清单。
> 当前范围和后续顺序见[项目开发基准](../../docs/web-ios-model-gateway-plan.md)。

Status: **prepared; no deployment or end-to-end OAuth acceptance has run**.

## Google Cloud project and consent configuration

- Project name: `vlingo-speaking-live-staging`
- Project ID: `project-acc2dc86-8102-4884-91e`
- Project number: `243940802264`
- Audience: External
- Publishing status: Testing
- Five operator-approved Google accounts are registered as test users. Their addresses are not
  duplicated in this repository.
- No additional sensitive or restricted scopes were added.

## Web client

- Application type: Web application
- Client name: `vlingo-speaking-live-staging-web`
- Client ID:
  `243940802264-li4d6670b0j33td9svjhdemg01gmt5vr.apps.googleusercontent.com`
- Authorized JavaScript origins:
  - `https://speaking-live-staging.vlingo.ai`
  - `http://127.0.0.1:5173`
- Authorized redirect URIs: none. The Web client uses Google Identity Services to obtain an ID
  token and does not use a server redirect flow.
- Created: 2026-09-21 12:11:38 GMT+8
- Status: Enabled

The client ID is public configuration and will be supplied as `GOOGLE_WEB_CLIENT_ID` to the API and
`VITE_GOOGLE_CLIENT_ID` to the Web build. The generated client secret is not required by this flow
and must not be committed, copied into the VPS environment, or exposed to either client.

`GOOGLE_IOS_CLIENT_ID` remains empty for Phase 5.5B. Phase 6 will create a separate user-owned iOS
client only after the new app bundle ID is fixed; this staging deployment does not reuse the
upstream Mural iOS client.

## Remaining verification

- Put the public client ID into the private staging `.env` under both expected variable names.
- Run `deploy/phase-5-5b/preflight.sh` without printing the environment.
- After deployment, verify Google sign-in with an approved test account on the staging origin and
  confirm that an unlisted account remains rejected while the consent app is in Testing status.
