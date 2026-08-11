#!/usr/bin/env bash
set -euo pipefail

ROOT="${GIZMO_ROOT:-/srv/gizmo}"
FAIL=0
need(){ command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1" >&2; FAIL=1; }; }

for cmd in git node npm docker curl jq openssl; do need "$cmd"; done

docker compose version >/dev/null 2>&1 || { echo 'MISSING: docker compose v2' >&2; FAIL=1; }

if [[ $(id -u) -eq 0 ]]; then
  echo 'BLOCKED: run application/Codex work as a non-root operator; use sudo only for explicitly documented host steps.' >&2
  FAIL=1
fi

MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
DISK_KB=$(df -Pk / | awk 'NR==2 {print $4}')
(( MEM_KB >= 16000000 )) || echo 'WARN: less than ~16 GiB RAM detected; local model/observability headroom may be insufficient.'
(( DISK_KB >= 30000000 )) || echo 'WARN: less than ~30 GiB root free space detected.'

mkdir -p "$ROOT"/{checkpoints,catalogs,knowledge-vault,backups,workflow-exports,generated}

echo "Preflight root: $ROOT"
ss -lntup || true

echo 'Checking current Agent Foundry health if present...'
curl -fsS http://127.0.0.1:3000/api/health || echo 'WARN: existing dashboard health endpoint unavailable.'

if (( FAIL != 0 )); then
  echo 'GIZMO PREFLIGHT: FAIL' >&2
  exit 1
fi

echo 'GIZMO PREFLIGHT: PASS'
