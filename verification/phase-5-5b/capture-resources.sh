#!/usr/bin/env bash
# Bounded, content-free VPS observation. Does not create/stop rooms or containers.
set -euo pipefail
duration=${1:-600}
if [[ ! "$duration" =~ ^[0-9]+$ ]] || (( duration < 1 || duration > 600 )); then
  echo 'usage: bash capture-resources.sh [seconds: 1..600]' >&2
  exit 2
fi
for dependency in docker timeout flock awk date mktemp; do
  command -v "$dependency" >/dev/null
done
exec 9>/run/lock/vlingo-gate7-resource-sample.lock
flock -n 9 || { echo 'Another Gate 7 resource sampler is running.' >&2; exit 1; }
umask 077
output=$(mktemp -d /var/tmp/vlingo-gate7-resources.XXXXXX)
printf 'RESOURCE_DIR=%s\n' "$output"
containers=(
  vlingo-speaking-live-staging-edge-1
  vlingo-speaking-live-staging-api-1
  vlingo-speaking-live-staging-agent-worker-1
  vlingo-speaking-live-staging-model-gateway-1
  vlingo-speaking-live-staging-database-1
)
printf 'duration_seconds=%s\ninterval=collection_time_plus_2_seconds\n' "$duration" >"$output/metadata.txt"
printf 'Docker memory usage is not process RSS. Summed process RSS may double-count shared pages. Host network counters include unrelated traffic. CPU%% is Docker CPU%%, not whole-host utilization.\n' >>"$output/metadata.txt"
finish() {
  rc=$?
  trap - EXIT
  printf 'exit_code=%s\nfinished_utc=%s\n' "$rc" "$(date -u +%FT%TZ)" >>"$output/metadata.txt"
  printf 'RESOURCE_DIR=%s EXIT_CODE=%s\n' "$output" "$rc"
  exit "$rc"
}
trap finish EXIT
trap 'exit 143' TERM
start=$SECONDS
sample=0
while (( SECONDS - start < duration )); do
  sample=$((sample + 1))
  utc=$(date -u +%FT%T.%3NZ)
  printf '%s\t%s\tbegin\n' "$sample" "$utc" >>"$output/windows.tsv"
  awk -v sample="$sample" -v utc="$utc" 'NR>2 {gsub(":", "", $1); print sample "\t" utc "\t" $1 "\t" $2 "\t" $10}' /proc/net/dev >>"$output/host-net.tsv"
  awk -v sample="$sample" -v utc="$utc" '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/ {print sample "\t" utc "\t" $1 "\t" $2}' /proc/meminfo >>"$output/host-memory-kib.tsv"
  # Buffer first: do not label a failed/partial observation as a complete sample.
  stats=$(timeout 12 docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' "${containers[@]}")
  printf '%s\n' "$stats" | awk -v sample="$sample" -v utc="$utc" '{print sample "\t" utc "\t" $0}' >>"$output/docker-stats.tsv"
  for container in "${containers[@]}"; do
    # Docker needs PID to filter processes. Persist only summed RSS, not PIDs or arguments.
    rss=$(timeout 5 docker top "$container" -eo pid,rss | awk 'NR==1 {if($1!="PID" || $2!="RSS") {bad=1; exit}; next} {if(NF!=2 || $1!~/^[0-9]+$/ || $2!~/^[0-9]+$/) {bad=1; exit}; sum += $2; n++} END {if(bad || n==0) exit 1; print sum}')
    printf '%s\t%s\t%s\t%s\n' "$sample" "$(date -u +%FT%T.%3NZ)" "$container" "$rss" >>"$output/process-rss-sum-kib.tsv"
  done
  printf '%s\t%s\tend\n' "$sample" "$(date -u +%FT%T.%3NZ)" >>"$output/windows.tsv"
  if (( sample == 1 || sample % 10 == 0 )); then
    printf 'SAMPLE_COMPLETE=%s UTC=%s\n' "$sample" "$(date -u +%FT%TZ)"
  fi
  sleep 2
done
printf 'samples=%s\n' "$sample" >>"$output/metadata.txt"
printf 'COMPLETED_SAMPLES=%s\n' "$sample"
