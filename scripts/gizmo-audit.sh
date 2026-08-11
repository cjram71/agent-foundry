#!/usr/bin/env bash
set -euo pipefail
OUT=${1:-/srv/gizmo/generated/vps-audit-$(date -u +%Y%m%dT%H%M%SZ).txt}
mkdir -p "$(dirname "$OUT")"
{
  echo '# Gizmo VPS read-only audit'
  date -u
  echo '## Git'; git rev-parse HEAD; git status --short --branch
  echo '## OS'; cat /etc/os-release 2>/dev/null || true; uname -a
  echo '## CPU'; nproc; lscpu 2>/dev/null | sed -n '1,20p' || true
  echo '## Memory'; free -h
  echo '## Disk'; df -hT
  echo '## Node/npm'; node --version 2>/dev/null || true; npm --version 2>/dev/null || true
  echo '## Docker'; docker version --format '{{.Server.Version}}' 2>/dev/null || true; docker compose version 2>/dev/null || true
  echo '## Containers'; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  echo '## Volumes'; docker volume ls 2>/dev/null || true
  echo '## PM2'; pm2 status 2>/dev/null || true
  echo '## Listening ports'; ss -lntup 2>/dev/null || true
  echo '## Firewall'; ufw status 2>/dev/null || true
  echo '## Health'; curl -fsS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null || echo 'dashboard health unavailable'
  echo '## Ollama models'; curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags 2>/dev/null | jq -r '.models[]?.name' 2>/dev/null || echo 'ollama unavailable'
  echo '## Backups'; find "${GIZMO_BACKUP_DIR:-/srv/gizmo/backups}" -maxdepth 2 -type f -printf '%TY-%Tm-%TdT%TH:%TM %s %p\n' 2>/dev/null | sort -r | head -30 || true
  echo '## IMPORTANT'; echo 'Secret values are intentionally not printed.'
} | tee "$OUT"
echo "Audit written to $OUT" >&2
