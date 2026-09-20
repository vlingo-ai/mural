#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
env_file=${1:-.env}
output_directory=${2:-backups}
[ -f "$env_file" ] || { printf 'backup: missing %s\n' "$env_file" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
: "${AGE_RECIPIENT:?Set AGE_RECIPIENT}"
command -v age >/dev/null 2>&1 || { printf 'backup: age is required\n' >&2; exit 1; }
mkdir -p "$output_directory"
chmod 700 "$output_directory"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$output_directory/postgres-$timestamp.sql.gz.age"
docker compose --env-file "$env_file" exec -T database pg_dump -U mural -d mural --no-owner --no-privileges \
  | gzip -9 \
  | age -r "$AGE_RECIPIENT" -o "$target"
chmod 600 "$target"
test -s "$target"
printf 'backup: wrote encrypted backup %s\n' "$target"
