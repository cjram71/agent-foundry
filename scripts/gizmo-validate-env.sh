#!/usr/bin/env bash
set -euo pipefail

fail=0
err(){ echo "BLOCKED: $*" >&2; fail=1; }
required=(POSTGRES_ADMIN_USER POSTGRES_ADMIN_PASSWORD REDIS_PASSWORD N8N_DB_NAME N8N_DB_USER N8N_DB_PASSWORD N8N_ENCRYPTION_KEY LITELLM_MASTER_KEY GRAFANA_ADMIN_PASSWORD)
for v in "${required[@]}"; do
  value=${!v:-}
  [[ -n "$value" ]] || { err "$v is unset"; continue; }
  [[ "$value" != REPLACE* ]] || err "$v still contains a placeholder"
done

(( ${#N8N_ENCRYPTION_KEY:-0} >= 32 )) || err 'N8N_ENCRYPTION_KEY must be at least 32 characters'
(( ${#LITELLM_MASTER_KEY:-0} >= 24 )) || err 'LITELLM_MASTER_KEY must be at least 24 characters'
(( ${#GRAFANA_ADMIN_PASSWORD:-0} >= 16 )) || err 'GRAFANA_ADMIN_PASSWORD must be at least 16 characters'

for pair in "N8N_BIND=${N8N_BIND:-}" "LITELLM_BIND=${LITELLM_BIND:-}"; do
  name=${pair%%=*}; value=${pair#*=}
  [[ "$value" == 127.0.0.1:* ]] || {
    if [[ "${GIZMO_ALLOW_PUBLIC_INGRESS:-false}" != true ]]; then err "$name must bind to 127.0.0.1 unless public ingress has an explicit approved design"; fi
  }
done

[[ "${GIZMO_N8N_CATALOG_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || err 'GIZMO_N8N_CATALOG_COMMIT must be a full 40-character commit SHA'
[[ "${GIZMO_N8N_CATALOG_REPO:-}" == https://github.com/cjram71/awesome-n8n-templates.git ]] || err 'Workflow catalog repository differs from approved cjram71 fork'

(( fail == 0 )) || exit 1
echo 'Gizmo environment validation: PASS'
