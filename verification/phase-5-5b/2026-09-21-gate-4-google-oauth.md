# Gate 4 — Google Web OAuth staging client (2026-09-21)

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

## Remaining verification

- Put the public client ID into the private staging `.env` under both expected variable names.
- Run `deploy/phase-5-5b/preflight.sh` without printing the environment.
- After deployment, verify Google sign-in with an approved test account on the staging origin and
  confirm that an unlisted account remains rejected while the consent app is in Testing status.
