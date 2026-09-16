# Mural Web

Phase 5 browser client for the same Mural API used by the native apps. The browser never receives
a Model Gateway or OpenAI credential. Google Identity Services can exchange a nonce-bound ID token
for a short-lived Mural bearer when `VITE_GOOGLE_CLIENT_ID` is configured. The local development
token and production bearer are held in React memory only and are intentionally cleared by reload.
Server history is authoritative; IndexedDB contains only an account-keyed disposable list cache.

## Local development

The full local stack can be started from the Mural repository root with:

```sh
MURAL_MODEL_GATEWAY_DIR=/absolute/path/to/model-gateway-phase-3-live ./scripts/run-web-stack.sh
```

The command reuses the existing Model Gateway worktree and its private `.env`, starts the installed
PostgreSQL 17 service when necessary, migrates an isolated `mural_web_dev` database, provisions a
local-only member with ten minutes, and starts a dedicated Gateway on port 8012, Mural API, and Web.
It refuses to take over an occupied Gateway port. The generated development bearer is not written to
disk by the script, stays in browser memory after you paste it, and expires after 12 hours. Ctrl-C
stops only the three processes started by the command; it does not stop another project already using
port 8000.

For separate manual startup:

1. Configure the API with `MURAL_WEB_ALLOWED_ORIGINS=http://127.0.0.1:5173` and start it on
   `127.0.0.1:8080`.
2. Copy `.env.example` to `.env.local` only if the API uses another local origin.
3. Run `npm install --ignore-scripts`, then `npm run dev`.
4. Paste a short-lived Mural account or guest bearer into the development field. Do not paste an
   OpenAI or Model Gateway key.

The browser first reads the server's live capability. The stable rollback path creates an OpenAI
WebRTC offer as before. In the optional Phase 5.5 path it receives a short-lived `livekit-room`
token and joins through the LiveKit browser SDK; that SDK is loaded only when selected. In both
paths the Mural API and Model Gateway remain the control, policy and accounting boundary.

To run the LiveKit spike with the isolated worker worktree:

```sh
MURAL_LIVEKIT_SPIKE=true \
MURAL_MODEL_GATEWAY_DIR=/Volumes/Kingston/DeepTutor/model-gateway-phase-3-live \
MURAL_LIVEKIT_WORKER_DIR=/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit/workers/livekit-gpt-live \
./scripts/run-web-stack.sh
```

The script starts a loopback LiveKit development server and supplies secrets only through process
environment variables. LiveKit spike mode defaults to the isolated `mural_web_livekit_spike_dev`
database; `MURAL_WEB_DATABASE_NAME` can select another development database whose name ends in
`_dev`. Do not use the development `devkey`/`secret` pair outside loopback.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

The Playwright test uses a browser-side WebRTC fixture plus the public Mural HTTP contract. The API
suite separately exercises that same public contract through a fake Model Gateway and PostgreSQL, so
CI covers the browser and Gateway boundaries without a paid provider call.
