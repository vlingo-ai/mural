#!/bin/zsh
set -euo pipefail

repo_dir="${0:A:h:h}"
gateway_dir="${MURAL_MODEL_GATEWAY_DIR:-/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit}"
gateway_port="${MURAL_MODEL_GATEWAY_PORT:-8012}"
livekit_spike="${MURAL_LIVEKIT_SPIKE:-false}"
livekit_worker_dir="${MURAL_LIVEKIT_WORKER_DIR:-/Volumes/Kingston/DeepTutor/model-gateway-phase-5-5-livekit/workers/livekit-gpt-live}"
database_name="${MURAL_WEB_DATABASE_NAME:-}"
if [[ -z "$database_name" ]]; then
  if [[ "$livekit_spike" == true ]]; then
    database_name="mural_web_livekit_spike_dev"
  else
    database_name="mural_web_dev"
  fi
fi
[[ "$database_name" =~ '^[A-Za-z_][A-Za-z0-9_]*$' && ${#database_name} -le 63 ]] || {
  print -u2 'MURAL_WEB_DATABASE_NAME must be a simple PostgreSQL identifier.'; exit 1;
}
database_url="postgresql://localhost/${database_name}"
dev_account_id="00000000-0000-4000-8000-000000000005"
dev_access_token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
child_pids=()

cleanup() {
  for child_pid in "${child_pids[@]}"; do kill "$child_pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for command_name in brew pg_isready createdb psql npm curl openssl; do
  command -v "$command_name" >/dev/null || { print -u2 "Missing required command: $command_name"; exit 1; }
done
[[ "$livekit_spike" == false || "$livekit_spike" == true ]] || {
  print -u2 'MURAL_LIVEKIT_SPIKE must be true or false.'; exit 1;
}
[[ -d "$gateway_dir" && -f "$gateway_dir/.env" && -x "$gateway_dir/.venv/bin/model-gateway" ]] || {
  print -u2 "Set MURAL_MODEL_GATEWAY_DIR to the existing Phase 3 Model Gateway worktree with .env and .venv."; exit 1;
}
if lsof -nP -iTCP:"$gateway_port" -sTCP:LISTEN >/dev/null 2>&1; then
  print -u2 "Port $gateway_port is already occupied; choose MURAL_MODEL_GATEWAY_PORT without stopping the other project."; exit 1
fi

pg_isready -q || brew services start postgresql@17 >/dev/null
pg_isready -q || { print -u2 'PostgreSQL did not become ready.'; exit 1; }
psql -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='${database_name}'" | grep -qx 1 || createdb "$database_name"

DATABASE_URL="$database_url" "$repo_dir/services/api/node_modules/.bin/tsx" "$repo_dir/services/api/src/migrate.ts"
MURAL_DEV_BOOTSTRAP=true DATABASE_URL="$database_url" MURAL_DEV_ACCOUNT_ID="$dev_account_id" MURAL_DEV_ACCESS_TOKEN="$dev_access_token" \
  npm --prefix "$repo_dir/services/api" run dev:bootstrap

(
  set -a; source "$gateway_dir/.env"; set +a
  : "${GATEWAY_OPENAI_MODEL_ASSESSMENT_DEFAULT:=${GATEWAY_OPENAI_MODEL_TRANSLATION_FAST:-}}"
  : "${GATEWAY_OPENAI_MODEL_REASONING_DEFAULT:=${GATEWAY_OPENAI_MODEL_TRANSLATION_FAST:-}}"
  : "${GATEWAY_OPENAI_MODEL_SEARCH_DEFAULT:=${GATEWAY_OPENAI_MODEL_TRANSLATION_FAST:-}}"
  export GATEWAY_OPENAI_MODEL_ASSESSMENT_DEFAULT GATEWAY_OPENAI_MODEL_REASONING_DEFAULT GATEWAY_OPENAI_MODEL_SEARCH_DEFAULT
  export GATEWAY_HOST=127.0.0.1 GATEWAY_PORT="$gateway_port"
  exec "$gateway_dir/.venv/bin/model-gateway"
) &
child_pids+=($!)

for attempt in {1..30}; do curl -fsS "http://127.0.0.1:${gateway_port}/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:${gateway_port}/healthz" >/dev/null || { print -u2 'Model Gateway did not become ready.'; exit 1; }

gateway_key="$(sed -n 's/^GATEWAY_API_KEY=//p' "$gateway_dir/.env" | head -1)"
[[ ${#gateway_key} -ge 32 ]] || { print -u2 'Model Gateway .env has no valid GATEWAY_API_KEY.'; exit 1; }
livekit_api_env=()
if [[ "$livekit_spike" == true ]]; then
  command -v livekit-server >/dev/null || { print -u2 'Install the local LiveKit server first.'; exit 1; }
  [[ -x "$livekit_worker_dir/.venv/bin/python" && -f "$livekit_worker_dir/mural_livekit/worker.py" ]] || {
    print -u2 'Set MURAL_LIVEKIT_WORKER_DIR to the isolated Phase 5.5 worker.'; exit 1;
  }
  livekit_control_secret="$(openssl rand -hex 32)"
  livekit-server --dev --bind 127.0.0.1 &
  child_pids+=($!)
  for attempt in {1..30}; do curl -sS --max-time 1 http://127.0.0.1:7880 >/dev/null 2>&1 && break; sleep 1; done
  (
    set -a; source "$gateway_dir/.env"; set +a
    [[ -n "${OPENAI_API_KEY:-}" ]] || { print -u2 'Gateway .env has no OPENAI_API_KEY for the LiveKit worker.'; exit 1; }
    cd "$livekit_worker_dir"
    exec env LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
      MURAL_CONTROL_URL=http://127.0.0.1:8080 MURAL_LIVEKIT_AGENT_NAME=mural-gpt-live \
      .venv/bin/python -m mural_livekit.worker dev
  ) &
  child_pids+=($!)
  livekit_api_env=(LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret
    LIVEKIT_CONTROL_SECRET="$livekit_control_secret" LIVEKIT_AGENT_NAME=mural-gpt-live)
fi

env DATABASE_URL="$database_url" PORT=8080 PUBLIC_ORIGIN=http://localhost:8080 \
  ACCOUNTS_ENABLED=true ACCOUNTS_ALLOW_LOCAL_LOOPBACK=true \
  ACCOUNTS_HMAC_KEY=1111111111111111111111111111111111111111111111111111111111111111 \
  ACCOUNTS_PROXY_TOKEN=2222222222222222222222222222222222222222222222222222222222222222 \
  GOOGLE_CLIENT_ID=local-dev.apps.googleusercontent.com \
  HOSTED_VOICE_EXPERIMENTAL=true HOSTED_VOICE_ACCOUNT_ALLOWLIST="$dev_account_id" \
  HOSTED_VOICE_LIFETIME_CAP_NANO=1000000000 HOSTED_VOICE_BILLING_UNIT=milliseconds \
  HOSTED_HELPERS_EXPERIMENTAL=true HOSTED_HELPER_BUDGET_PER_MINUTE_NANO=50000000 \
  HOSTED_HELPER_SEARCHES_PER_SESSION=1 MODEL_GATEWAY_URL="http://127.0.0.1:${gateway_port}" \
  MODEL_GATEWAY_API_KEY="$gateway_key" MURAL_WEB_ALLOWED_ORIGINS=http://127.0.0.1:5173 \
  "${livekit_api_env[@]}" \
  "$repo_dir/services/api/node_modules/.bin/tsx" watch "$repo_dir/services/api/src/main.ts" &
child_pids+=($!)

for attempt in {1..30}; do curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8080/healthz >/dev/null || { print -u2 'Mural API did not become ready.'; exit 1; }
npm --prefix "$repo_dir/apps/web" run dev &
child_pids+=($!)

print ''
print 'Mural Web stack is ready at http://127.0.0.1:5173'
print "Development access token (not written to disk, expires within 12 hours): ${dev_access_token}"
if [[ "$livekit_spike" == true ]]; then
  print 'LiveKit Phase 5.5 mode is enabled; OpenAI rejection is expected while the API account has no balance.'
fi
print 'Press Ctrl-C to stop Web, Mural API and the dedicated local processes.'
wait
