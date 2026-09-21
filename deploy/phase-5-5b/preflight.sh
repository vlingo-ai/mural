#!/bin/sh
set -eu

cd "$(dirname "$0")"
env_file=${1:-.env}

fail() { printf 'preflight: %s\n' "$1" >&2; exit 1; }
for command_name in docker curl getent openssl python3; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'
[ -f "$env_file" ] || fail "missing private environment file: $env_file"
mode=$(stat -c '%a' "$env_file")
[ "$mode" = 600 ] || fail "$env_file must have mode 600 (found $mode)"

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

required='WEB_DOMAIN API_DOMAIN MURAL_API_IMAGE MODEL_GATEWAY_IMAGE LIVEKIT_WORKER_IMAGE LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_CONTROL_SECRET WORKER_OPENAI_API_KEY GATEWAY_OPENAI_API_KEY GATEWAY_API_KEY GATEWAY_OPENAI_MODEL_TRANSLATION_FAST GATEWAY_OPENAI_MODEL_ASSESSMENT_DEFAULT GATEWAY_OPENAI_MODEL_REASONING_DEFAULT GATEWAY_OPENAI_MODEL_SEARCH_DEFAULT POSTGRES_PASSWORD HOSTED_VOICE_ACCOUNT_ALLOWLIST HOSTED_VOICE_LIFETIME_CAP_NANO HOSTED_HELPER_BUDGET_PER_MINUTE_NANO ACCOUNTS_HMAC_KEY ACCOUNTS_PROXY_TOKEN GOOGLE_WEB_CLIENT_ID VITE_GOOGLE_CLIENT_ID AGE_RECIPIENT'
for variable_name in $required; do
  eval "variable_value=\${$variable_name-}"
  [ -n "$variable_value" ] || fail "$variable_name is empty"
  case "$variable_value" in *REQUIRED*|*example.invalid*) fail "$variable_name still contains a placeholder";; esac
done

printf '%s' "$MODEL_GATEWAY_IMAGE" | grep -Eq '^.+@sha256:[a-f0-9]{64}$' || fail 'MODEL_GATEWAY_IMAGE must use an immutable sha256 digest'
printf '%s' "$LIVEKIT_WORKER_IMAGE" | grep -Eq '^.+@sha256:[a-f0-9]{64}$' || fail 'LIVEKIT_WORKER_IMAGE must use an immutable sha256 digest'
case "$LIVEKIT_URL" in wss://*.livekit.cloud|wss://*) :;; *) fail 'LIVEKIT_URL must use wss://';; esac
[ "$WORKER_OPENAI_API_KEY" != "$GATEWAY_OPENAI_API_KEY" ] || fail 'Worker and Gateway OpenAI keys must be independently revocable'
[ "${#LIVEKIT_CONTROL_SECRET}" -ge 32 ] || fail 'LIVEKIT_CONTROL_SECRET must contain at least 32 characters'
[ "${#GATEWAY_API_KEY}" -ge 32 ] || fail 'GATEWAY_API_KEY must contain at least 32 characters'
[ "${#ACCOUNTS_PROXY_TOKEN}" -ge 32 ] || fail 'ACCOUNTS_PROXY_TOKEN must contain at least 32 characters'
printf '%s' "$ACCOUNTS_HMAC_KEY" | grep -Eq '^[a-f0-9]{64}$' || fail 'ACCOUNTS_HMAC_KEY must be 64 lowercase hex characters'
printf '%s' "$HOSTED_VOICE_ACCOUNT_ALLOWLIST" | grep -Eq '^[a-f0-9-]{36}(,[a-f0-9-]{36})*$' || fail 'allowlist must contain staging account UUIDs'
printf '%s' "$POSTGRES_PASSWORD" | grep -Eq '^[A-Za-z0-9_-]{32,}$' || fail 'POSTGRES_PASSWORD must be URL-safe and at least 32 characters'
printf '%s' "$HOSTED_VOICE_LIFETIME_CAP_NANO" | grep -Eq '^[0-9]+$' || fail 'HOSTED_VOICE_LIFETIME_CAP_NANO must be an integer'
[ "$HOSTED_VOICE_LIFETIME_CAP_NANO" -ge 500000000 ] && [ "$HOSTED_VOICE_LIFETIME_CAP_NANO" -le 25000000000 ] || fail 'restricted lifetime cap must be between 0.50 and 25 USD in nanoUSD'
printf '%s' "$HOSTED_HELPER_BUDGET_PER_MINUTE_NANO" | grep -Eq '^[1-9][0-9]*$' || fail 'helper budget must be a positive integer'

for domain in "$WEB_DOMAIN" "$API_DOMAIN"; do
  getent ahostsv4 "$domain" >/dev/null 2>&1 || fail "$domain does not resolve over IPv4"
done

docker compose --env-file "$env_file" config --quiet
printf 'preflight: PASS (configuration parsed; secrets not printed)\n'
