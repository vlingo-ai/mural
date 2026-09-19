#!/bin/sh
set -eu

cd "$(dirname "$0")"
env_file=${1:-.env}
[ -f "$env_file" ] || { printf 'sessions: missing %s\n' "$env_file" >&2; exit 1; }

docker compose --env-file "$env_file" exec -T database psql -U mural -d mural \
  --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command "SELECT state || '|' || count(*) FROM hosted_sessions WHERE state <> 'closed' GROUP BY state ORDER BY state"
