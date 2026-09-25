#!/bin/sh
set -eu

cd "$(dirname "$0")"
env_file=${1:-.env}
[ -f "$env_file" ] || { printf 'verify: missing %s\n' "$env_file" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

compose() { docker compose --env-file "$env_file" "$@"; }
compose ps --status running
curl --fail --silent --show-error --max-time 10 "https://$API_DOMAIN/healthz" >/dev/null
curl --fail --silent --show-error --max-time 10 "https://$WEB_DOMAIN/" >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8000/healthz >/dev/null

capabilities=$(curl --fail --silent --show-error --max-time 5 \
  -H "Authorization: Bearer $GATEWAY_API_KEY" http://127.0.0.1:8000/v1/audio/capabilities)
printf '%s' "$capabilities" | python3 -c '
import json, sys
body = json.load(sys.stdin)
required = ("transcription", "alignment", "reading_diagnostics")
assert all(body["operations"][name]["available"] is False for name in required)
assert all(body["operations"][name]["reason"] == "backend_disabled" for name in required)
' || {
  printf 'verify: Gateway does not report disabled audio capability\n' >&2
  exit 1
}

for service_name in database model-gateway api agent-worker agent-worker-replay edge; do
  container_id=$(compose ps -q "$service_name")
  [ -n "$container_id" ] || { printf 'verify: %s container is absent\n' "$service_name" >&2; exit 1; }
  docker inspect --format '{{.Name}} {{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}' "$container_id" 2>/dev/null || \
    docker inspect --format '{{.Name}} {{.Config.Image}} {{.State.Status}}' "$container_id"
done

compose exec -T agent-worker-replay python -m mural_livekit.outbox_status --require-empty || {
  printf 'verify: durable control outbox is not empty or cannot be inspected\n' >&2
  exit 1
}

if compose logs --since 15m api model-gateway agent-worker agent-worker-replay 2>&1 | grep -E 'OPENAI_API_KEY=|LIVEKIT_API_SECRET=|MURAL_CONTROL_OUTBOX_KEY=|Authorization: Bearer |DATABASE_URL=' >/dev/null; then
  printf 'verify: possible secret-bearing log line detected\n' >&2
  exit 1
fi
printf 'verify: PASS (public TLS, health, disabled audio capability, containers, sanitized logs)\n'
