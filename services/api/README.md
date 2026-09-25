# Mural API: current scope and backend references

Follow the [accepted development baseline](../../docs/web-ios-model-gateway-plan.md).
Staging is deployed with restricted English Web access through LiveKit/Worker and Gateway Responses;
Gate 7 is not accepted. Public commercial launch and new payment activation are not authorized.
Use the [staging runbook](../../deploy/phase-5-5b/README.md), not the historical Hetzner procedure,
for this VPS. Native/BYOK and account/commerce instructions below are compatibility references,
not a statement about current upstream production or permission to activate those features here.

Minute entitlements, purchased AI value and provider cost accounting are separate. Existing code
does not authorize a new commercial price or live sales. Read [conversation minutes](../../docs/conversation-minutes.md)
and the baseline before configuring operator controls; do not apply older fixed-minute pricing plans.

## Run locally

Use Node.js 22.19 or later, npm, and a separate PostgreSQL database. PostgreSQL 14 was used for the integration tests; the deployment configuration uses PostgreSQL 17.

From this directory:

```sh
npm ci
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a database reserved for Mural. Keep `.env` private and excluded from Git. The example password is only for a local development database.

Apply the schema and start the development server:

```sh
npm run migrate
npm run dev
```

Open `http://localhost:8080/healthz`. A successful response identifies this as `commercial-foundation` with `hostedVoice: false` and `livePayments: false`. `/readyz` also checks the database.

For a compiled local run:

```sh
npm run build
npm start
```

## Run tests

Run the unit and HTTP boundary tests with:

```sh
npm test
```

For the full suite, set `TEST_DATABASE_URL` to an **isolated test database whose name ends in `_test`**, then run `npm test`. The integration suite applies migrations and adds synthetic test accounts, purchases, and usage. It never invokes OpenAI, Google, Apple, or Stripe servers. Ledger tests retain synthetic rows; voice tests create and remove isolated PostgreSQL schemas.

```sh
TEST_DATABASE_URL=postgresql://mural_test@127.0.0.1:55434/mural_billing_test npm test
```

The URL above is an example for an already-running local test database. Do not use a production database. Without `TEST_DATABASE_URL`, PostgreSQL tests are explicitly skipped.

## Prepare a Hetzner deployment

Create a private `.env` on the server containing `POSTGRES_PASSWORD` and `API_DOMAIN`. Use a unique URL-safe database password, such as random hexadecimal text; do not reuse the development example. Point the API hostname to the server and allow incoming TCP 80/443 and UDP 443. Do not expose PostgreSQL publicly.

Validate and start the containers:

```sh
docker compose config --quiet
docker compose up --build -d
```

Compose runs the schema migration before the API starts. Caddy obtains HTTPS certificates. Database contents live in `postgres_data`; keep that volume when updating. Configure encrypted off-server database backups and test restoration before accepting money. Do not run `docker compose down --volumes` against retained data.

This starts the foundation only. It does not enable hosted voice or real purchases. Do not direct paying users to it yet.

## Configure identity and sandbox checkout

Set `GOOGLE_IOS_CLIENT_ID` to the exact audience issued to the iOS app. Request a nonce from `/v1/auth/challenge`, include that exact nonce in the Google OIDC authorization request, and send the resulting ID token to `/v1/auth/exchange`. Tokens without the expected nonce are rejected. The server does not accept an email address or client-declared account ID as authentication.

Apple sign-in requires `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH`, pointing to a private Sign in with Apple `.p8` file. The adapter exchanges a fresh native authorization code, verifies the returned ID token against the authenticated account’s Apple subject, and revokes its refresh/access token. Provider tokens stay in memory. Supplying `APPLE_CLIENT_ID` alone does not enable Apple sign-in. The adapter has cryptographic tests using fake responses; real Apple configuration and device verification remain pending. Mount the private key read-only through a deployment override; never add it to the image or repository.

For payment testing, supply the `STRIPE_TEST_*` variables in `.env`. Only `sk_test_` secrets are accepted. Create one-time USD sandbox Prices whose totals equal AI value + 15% Mural fee + the configured payment fee. Configure the exact `price_…` IDs and payment-fee amounts in cents. The server retrieves the Price and verifies its amount, currency, and test mode before creating Checkout. Taxes and live processor fees are not calculated by this foundation.

Point a Stripe sandbox webhook to `/v1/webhooks/stripe`, with the webhook signing secret, for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.created`. The handler verifies the signature on the original bytes. Credit comes from a confirmed payment mapped to a server-created order, never the return URL or client metadata. Retries retrieve the stored Checkout session, including after Stripe’s idempotency-key retention window. An expired Checkout needs a new order; an uncertain create older than 23 hours needs reconciliation. A session whose database mapping fails is expired and its URL is never returned. Resolved disputes still require operator reconciliation; do not activate real payments before that workflow exists. Account deletion returns `409 unresolved_billing` while any pending checkout, balance, or reservation remains. New purchases and reservations lock the account against deletion, so a payment cannot be stranded on a deleted account. This temporary restriction requires a supported refund/expiry/deletion workflow before commercial release.

## Endpoint contracts

All monetary strings are integer **nanoUSD**: 1 USD = 1,000,000,000 nanoUSD. A display credit is $0.01 of AI usage. All responses disable caching. Authentication tokens expire after 24 hours; this foundation has no refresh-token endpoint. Sign in again after expiration.

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /v1/auth/challenge` | Empty JSON object | `challengeID`, `nonce`, `expiresInSeconds` |
| `POST /v1/auth/exchange` | `provider`, `idToken`, `challengeID` | `accountID`, `accessToken`, `expiresInSeconds` |
| `GET /v1/wallet` | Bearer token | `currency`, `balanceNanoUSD`, `reservedNanoUSD`, `availableNanoUSD` |
| `GET /v1/minutes` | Guest or member bearer token | Exact time balance, reservation and available milliseconds |
| `POST /v1/guest/minutes` | Verified guest attestation proof | Guest session and remaining allowance; disabled without a verified adapter |
| `POST /v1/minutes/welcome` | Member token and account-bound attestation proof | Claims the signup offer once within allocation budgets |
| `POST /v1/minutes/link-guest` | Member token; `guestAccessToken`, optional `deferPending` and `guestAccountID` | Transfers settled guest time; opted-in clients can retain an unsettled transfer without blocking member funds |
| `POST /v1/auth/sign-out` | Bearer token | Revokes this account's Mural sessions |
| `DELETE /v1/account` | Bearer token; Apple additionally needs a fresh authorization code | Removes identity/email/session data; retains required financial records under an opaque ID |
| `GET /v1/pricing` | None | Dated provider rates, money units, and separate-fee policy |
| `POST /v1/checkout` | Bearer token; `Idempotency-Key`; `product` = `ai-10-usd` or `ai-25-usd` | `checkoutURL`, `orderID`, `sandbox: true`, itemized `quote` |
| `POST /v1/webhooks/stripe` | Raw signed Stripe JSON | Atomic payment/refund journal update and duplicate receipt |
| `POST /v1/trial/eligibility` | Apple attestation proof | `503 trial_attestation_unavailable` until a verified adapter is configured |
| `POST /v1/live/sessions` | Bearer; `Idempotency-Key`; language; top-level `sdp` for legacy WebRTC; optional requested duration/history per runtime validation | Gated; LiveKit returns `livekit-room` transport and short-lived room credentials; legacy WebRTC returns SDP; provider model credentials stay server-only |
| `GET /v1/live/sessions/:id` | Bearer token belonging to the session owner | Minimal state, cumulative milliseconds, confirmed provider cost and customer debit |
| `POST /v1/live/sessions/:id/close` | Bearer token belonging to the session owner | Requests server closure; never accepts client-reported usage |
| `POST /v1/model-tasks` | Member Bearer token; `Idempotency-Key`; prompt-free business task and explicit funding | Translation, assessment and teaching reply use an owned Live session; topic search may instead reserve verified account AI value when separately enabled |
| `GET /v1/conversations` | Member Bearer token | Server-authoritative recent sessions with bounded previews and result counts |
| `GET /v1/conversations/:id` | Member Bearer token belonging to the session owner | Ordered transcript fragments and learning results; no raw audio or provider credential |
| `POST /v1/conversations/:id/events` | Member Bearer token belonging to the session owner; bounded idempotent event | Appends one live or typed transcript fragment |

Error responses contain a safe `error.code` only. Request bodies, keys, ID tokens, bearer tokens, Stripe payloads, and conversations are not logged. Expired authentication records are pruned every 15 minutes. The basic in-memory rate limit does not trust forwarded client-IP headers; behind Caddy it applies conservatively to the proxy address. Configure and test a trusted-proxy policy before scaling it.

## Restricted voice experiment

The source default remains `HOSTED_VOICE_EXPERIMENTAL=false`. The historical foundation Compose
and the current Phase 5.5B staging bundle are different deployment wrappers. Staging requires the
following configuration through its private environment, without changing public commercial gates:

- `HOSTED_VOICE_EXPERIMENTAL=true` and the staging runbook's LiveKit/control configuration.
  Worker holds the realtime OpenAI key; staging API does not. Gateway URL/key configure teaching
  Responses only, never realtime selection. Gateway uses HTTPS except exact loopback HTTP;
  health probes do not send its credential. The retry-free Responses client has bounded timeouts
  and a circuit breaker. Direct OpenAI WebRTC is an explicit development compatibility path.
- Explicit existing account UUIDs in `HOSTED_VOICE_ACCOUNT_ALLOWLIST`; sandbox purchases never qualify a public user automatically.
- `HOSTED_VOICE_LIFETIME_CAP_NANO`, between $0.50 and $25 expressed in nanoUSD. It bounds admission against persisted lifetime exposure, including unresolved sessions. It does not reset on restart.

The legacy cash experiment reserved $0.50; current staging uses minute reservations and its
explicitly authorized limits. Do not apply the old amount as staging policy. Trusted provider usage,
not a client stopwatch, determines settlement. Creation is not automatically retried; query the
existing session after an uncertain result. Lease-expiry user settlement can be non-final for provider
reconciliation. Persistent cleanup retry and Worker control-lease self-stop remain baseline B1 work;
a closed DB row alone does not prove the provider has stopped.

A PostgreSQL advisory lock permits one controller. Restart recovery and the watchdog attempt to
close saved sessions; do not scale this controller to multiple API replicas without ownership design.
Uncertain creation and some missing-final paths retain unresolved funding, whereas the LiveKit
lease-expiry policy settles the user at last trusted usage and marks provider reconciliation.
Neither a user settlement nor a hangup response establishes an exact final provider bill.

The accounting callback excludes content, but the separate Web history API stores transcripts
and learning results in PostgreSQL. Worker uses GPT client delegation through Mural to Gateway;
helpers have independent budgets. Some final control acknowledgments currently precede durable
commit; baseline B2 fixes that gap. Reliable Worker final-history delivery is also planned.

`tests/model-gateway-e2e.test.ts` exercises the public Mural path against an OpenAI Live fixture,
a separate local fake Model Gateway Responses endpoint, and PostgreSQL without provider credentials
or paid model calls. It verifies that Live provider lifecycle and Model Gateway inference routing
remain separate while sharing Mural's trusted funding and session boundary.

Model Gateway configuration never selects or advertises the Live provider. Live uses LiveKit when
its server credentials are configured and otherwise uses the explicit OpenAI WebRTC development
fallback. Mural owns the product capability and ledger; the LiveKit Agent Worker owns real-time
provider readiness. Model Gateway is limited to Responses, ASR and Alignment routing.

When hosted helpers are enabled with the same Gateway configuration, Mural maps meaning,
assessment, ordinary reasoning and search requests to stable logical model aliases. The
Gateway result must report cached and cache-write input tokens, output tokens and actual
Web Search calls; Mural never infers billable usage from the requested tools. Citation URLs
must be credential-free HTTPS sources, are bounded and deduplicated by Gateway, and are
validated again before being returned to a client.

The public `/v1/model-tasks` route never accepts model names, provider settings, prompts,
tools or output schemas. Translation, assessment and teaching reply require an owned Live
session and settle through its existing helper budget. Topic search also accepts the explicit
`{"type":"account"}` funding mode when `ACCOUNT_MODEL_TASKS_EXPERIMENTAL=true` and paid AI
value is enabled. That path is member-only, admits at most one concurrent request per account,
reserves the conservative maximum provider cost before one network attempt, and settles only
trusted Gateway usage. An unknown outcome retains the exact request hold indefinitely; an
observed provider overrun records immutable billing evidence and stops further admissions.
Neither case is automatically retried. Durable rows contain no topic query, prompt, output,
transcript, provider model name or credential. Apply
`operations/account-model-task-runtime-grants.sql` after the actual-value grants when using a
restricted runtime database role.

Conversation history stores only bounded text fragments and validated learning results; raw audio,
SDP, provider session identifiers and credentials are excluded. Apply
`operations/conversation-history-runtime-grants.sql` after migration 026 when using the restricted
runtime role. Product selectors admit only current launch locales, while stored locale strings remain
readable for older native clients and historical sessions.

A wall-clock close request is **not an absolute provider spending guarantee during a network
partition**. Use the current LiveKit/Worker cleanup and final-usage findings in the baseline.
The older direct-WebRTC hangup question below belongs to that compatibility adapter, not a claim
that no paid staging calls have happened. Existing dated acceptance records remain authoritative.

## Container verification

An isolated smoke stack uses PostgreSQL 17, no Caddy, and an ephemeral localhost-only API port:

```sh
docker compose -p mural-foundation-smoke -f tests/compose.smoke.yaml up --build -d api
docker compose -p mural-foundation-smoke -f tests/compose.smoke.yaml run --rm tests
docker compose -p mural-foundation-smoke -f tests/compose.smoke.yaml port api 8080
```

Only this disposable test project may be removed with:

```sh
docker compose -p mural-foundation-smoke -f tests/compose.smoke.yaml down --volumes
```

## Complete before commercial activation

- Verify the implemented GPT-Live transport against a real bounded call, including WebRTC hangup support, recovery after provider finalization, unknown creation outcomes, process/database failure, and provider-level spending protection. Build operator reconciliation for incomplete sessions; fake-provider tests cannot establish the provider’s failure behavior.
- Implement App Attest and DeviceCheck verification and trial-claim persistence against Apple. `TrialAttestor` defaults to rejection. No environment switch grants free usage.
- Apply a global trial budget, a 600-second per-device allowance, output/search limits, and failure exposure limits. Confirm cutoff behavior with an untrusted client and failed control connections.
- Verify Apple authorization revocation on a real device; complete account deletion with unresolved purchases/balances, token refresh, identity linking, and device-loss recovery.
- Add StoreKit verified transactions, purchase refunds, and storefront routing before in-app sales. Stripe support alone is not an App Store payment implementation.
- Confirm the operator's merchant country, tax treatment, channel fees, retention periods, and live receipt details. Then implement live payment activation, taxes, dispute resolution, support tooling, and operator reconciliation.
- Separate migration and runtime database privileges; add financial backup/restore verification, operational alerts without content, and tested provider-level spending protection.

Local verification on 15 September 2026: TypeScript checks passed, and **357 tests passed with no skips** against an isolated local PostgreSQL 17.11 database. They cover ledger races, Checkout retry/mapping/deletion races, signed raw webhooks, JWTs, Apple revocation, access requests, accounts, HTTP/WebSocket voice metering and recovery, and the Model Gateway Responses adapter. The Model Gateway contract check also passed against `vlingo.model-gateway@1.0`. The earlier container hardening checks remain recorded: read-only filesystem, dropped capabilities, localhost-only API port, passing database readiness, and zero known dependency vulnerabilities. No paid provider calls or real payments were made.


## Provider contracts

The legacy direct adapter references [OpenAI WebRTC creation](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live),
[sideband controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live),
[usage](https://developers.openai.com/api/docs/guides/live-conversations#usage-and-graceful-close) and
[hangup](https://developers.openai.com/api/reference/typescript/resources/live/subresources/sessions/methods/hangup).
Those historical references are not the deployed LiveKit Worker protocol or evidence for its gate.
Revalidate the direct adapter independently before using it as anything beyond explicit diagnostics.

Apple revocation follows [authorization-code validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens), [token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens), and the [client-secret contract linked from Apple's Sign in with Apple documentation](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret). Checkout retry handling follows [Stripe's idempotency retention contract](https://docs.stripe.com/api/idempotent_requests).

### Deferred guest transfer

`POST /v1/minutes/link-guest` authenticates the member using its bearer token. The initial request supplies `guestAccessToken`. `deferPending` defaults to `false`: existing clients receive `409 finish_guest_conversation_first` while the guest has reserved minutes or an unresolved hosted session.

With `deferPending: true`, a valid guest bearer establishes an immutable guest-to-member binding. A pending result is `{ "transferredMilliseconds": 0, "alreadyLinked": false, "outcome": "pending", "pending": true }`. This confirms ownership, not completion of accounting. The member's own gifts and verified purchases remain usable. Guest holds and provider liabilities stay on the guest account; the binding requests closure and prevents new guest conversations, installation resume and duplicate member welcome claims.

A retry can use the original guest bearer, including after its expiry once the binding exists. A member-only retry supplies `{ "deferPending": true, "guestAccountID": "<original guest UUID>" }`. The member and exact guest must match the stored binding. `404 guest_link_not_found` means no matching owned binding; a missing guest ID is invalid. An optional guest ID alongside the initial bearer must identify the same guest (`409 guest_link_mismatch` otherwise). An expired bearer without a prior binding returns `401 invalid_guest_session`; it does not establish ownership.

After provider accounting settles, a retry or the background worker completes the transfer once. Successful opted-in results contain `pending: false` and the existing `transferred` or `member_trial_already_claimed` outcome. The latter transfers zero additional trial time. Clients retain the original guest identity until that guest's terminal result; another device's result cannot clear it. Sign-out does not remove the binding. If the member deletes its account first, finalization forfeits remaining guest promotional time only after settlement and records `member_deleted`; it never recreates the member or transfers a late grant.

The worker starts with the API and checks up to 25 eligible bindings every 60 seconds. A held balance or unresolved hosted session stays pending; no timeout, hangup acknowledgment or last observed duration substitutes for final provider usage. Migration 023 adds immutable `minute_guest_link_intents` and `minute_guest_link_completions`; `operations/minute-runtime-grants.sql` grants runtime only `SELECT, INSERT` on them. The existing final transfer journal remains unchanged.

## Diagnose requests and voice closure

The API process writes one JSON record per completed or failed request, plus provider attempts, voice lifecycle transitions and background failures. A failed HTTP response includes `X-Mural-Error-Reference`; match that 12-character reference to the `reference` field in the log. Related provider requests inherit the same reference, even when requests overlap. Voice lifecycle records also carry a shortened opaque `sessionReference`.

Records include UTC time, level, event, the matched route template or fixed operation, status, duration and safe failure categories. Provider records may include a sanitized request ID and HTTP status. Database failures use categories such as `database_permission`, `database_constraint` or `database_unavailable`; a source filename and line may help locate an unexpected application failure. Bodies, transcripts, authorization headers, tokens, query strings, raw error messages, SQL and full stack traces are excluded. New application error categories must be added to `src/diagnostic-error-codes.ts`; unknown categories appear as `internal`.

For container deployments:

```sh
docker compose logs --since 30m api
```

Filter the JSON records by the learner’s reference. `voice_close_requested` means a close was requested; `voice_closed` is emitted after confirmed usage settlement. A lost connection or failed hangup must not be treated as billing confirmation. Do not retry a billed provider create merely because its result is uncertain.

Compose rotates API, proxy and database logs at 10 MB with five files retained per container. This is a local size limit, not an off-server archive or a time-based retention guarantee. Restrict operational-log access and configure any longer retention separately. Logging failures cannot change request, settlement or authentication results.
