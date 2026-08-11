#!/usr/bin/env bash
set -euo pipefail

vars=(N8N_IMAGE LITELLM_IMAGE GRAFANA_IMAGE PROMETHEUS_IMAGE LOKI_IMAGE TEMPO_IMAGE ALLOY_IMAGE NODE_EXPORTER_IMAGE CADVISOR_IMAGE)
fail=0
for v in "${vars[@]}"; do
  value=${!v:-}
  if [[ -z "$value" || "$value" == REPLACE_* || "$value" == *':latest' || "$value" == *':main-latest' ]]; then
    echo "BLOCKED: $v must be explicitly pinned to a reviewed immutable version/digest, got '${value:-unset}'" >&2
    fail=1
  fi
done
(( fail == 0 )) || exit 1
echo 'Container image pin validation: PASS'
