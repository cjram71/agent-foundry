#!/usr/bin/env bash
set -euo pipefail

check(){ local name=$1 url=$2; echo "Checking $name..."; curl -fsS --max-time 10 "$url" >/dev/null; }
check n8n http://127.0.0.1:5678/healthz
check prometheus http://127.0.0.1:9090/-/healthy
check grafana http://127.0.0.1:3002/api/health
check loki http://127.0.0.1:3100/ready
check tempo http://127.0.0.1:3200/ready

if [[ -n "${LITELLM_MASTER_KEY:-}" ]]; then
  curl -fsS --max-time 10 -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" http://127.0.0.1:4000/health/liveliness >/dev/null
else
  echo 'LITELLM_MASTER_KEY missing' >&2; exit 1
fi

docker ps --format '{{.Names}}' | grep -qx gizmo_alloy
docker ps --format '{{.Names}}' | grep -qx gizmo_node_exporter
docker ps --format '{{.Names}}' | grep -qx gizmo_cadvisor

echo 'Gizmo auxiliary services: PASS'
