#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${GIZMO_ENV_FILE:-/etc/gizmo/gizmo.env}
PHASE=${1:-all}

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE. Copy config/gizmo.env.example and add secrets/pinned images." >&2; exit 2; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

CHECKPOINT_DIR=${GIZMO_CHECKPOINT_DIR:-/srv/gizmo/checkpoints}
mkdir -p "$CHECKPOINT_DIR"

run_gate(){
  local prior=$1 file
  [[ -z "$prior" ]] && return 0
  file="$CHECKPOINT_DIR/$prior.json"
  [[ -f "$file" ]] || { echo "BLOCKED: missing previous checkpoint $file" >&2; exit 3; }
  node "$REPO_ROOT/scripts/gizmo-checkpoint-gate.js" "$file"
}

approved_for(){
  local id=$1
  case ",${GIZMO_HUMAN_APPROVED_PHASES:-}," in
    *",$id,"*) return 0;;
    *) return 1;;
  esac
}

write_checkpoint(){
  local id=$1 name=$2 approval=${3:-false}
  local now sha approval_status approved_by approved_at
  now=$(date -u +%FT%TZ)
  sha=$(git -C "$REPO_ROOT" rev-parse HEAD)
  approval_status=NOT_REQUIRED
  approved_by=null
  approved_at=null
  if [[ "$approval" == true ]]; then
    approved_for "$id" || { echo "BLOCKED: human approval required. Add $id to GIZMO_HUMAN_APPROVED_PHASES only after owner approval." >&2; exit 5; }
    approval_status=APPROVED
    approved_by='"operator"'
    approved_at="\"$now\""
  fi
  cat > "$CHECKPOINT_DIR/$id.json" <<JSON
{
  "phaseId": "$id",
  "phaseName": "$name",
  "status": "PASS",
  "gitSha": "$sha",
  "builder": "gizmo-install.sh",
  "startedAt": "$now",
  "completedAt": "$now",
  "scope": ["$name"],
  "checks": [{"id":"phase-command","mandatory":true,"result":"PASS","summary":"installer command completed successfully"}],
  "humanApproval": {"required": $approval, "status": "$approval_status", "approvedBy": $approved_by, "approvedAt": $approved_at},
  "rollbackReady": true,
  "rollbackRef": "docs/GIZMO_VPS_INSTALLER.md",
  "artifacts": [],
  "notes": null
}
JSON
  node "$REPO_ROOT/scripts/gizmo-checkpoint-gate.js" "$CHECKPOINT_DIR/$id.json"
}

phase00(){
  "$REPO_ROOT/scripts/gizmo-preflight.sh"
  write_checkpoint phase-00-preflight "VPS preflight" false
}
phase01(){
  run_gate phase-00-preflight
  bash "$REPO_ROOT/scripts/backup.sh"
  write_checkpoint phase-01-backup "Fresh verified backup prerequisite" false
}
phase02(){
  run_gate phase-01-backup
  bash "$REPO_ROOT/scripts/gizmo-bootstrap-knowledge.sh"
  bash "$REPO_ROOT/scripts/gizmo-install-catalogs.sh"
  write_checkpoint phase-02-foundations "Knowledge vault and pinned catalogs" false
}
phase03(){
  run_gate phase-02-foundations
  [[ "${GIZMO_ALLOW_DATABASE_CHANGES:-false}" == true ]] || { echo 'Database change approval flag is false; phase 03 blocked.' >&2; exit 4; }
  approved_for phase-03-n8n-db || { echo 'Owner approval required for n8n DB provisioning.' >&2; exit 5; }
  bash "$REPO_ROOT/scripts/gizmo-provision-n8n-db.sh"
  write_checkpoint phase-03-n8n-db "n8n database provisioning" true
}
phase04(){
  run_gate phase-03-n8n-db
  "$REPO_ROOT/scripts/gizmo-validate-pins.sh"
  docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/infra/compose/gizmo-services.yml" config >/dev/null
  docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/infra/compose/gizmo-services.yml" pull
  docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/infra/compose/gizmo-services.yml" up -d
  write_checkpoint phase-04-services "n8n LiteLLM and observability services" false
}
phase05(){
  run_gate phase-04-services
  "$REPO_ROOT/scripts/gizmo-verify-services.sh"
  write_checkpoint phase-05-service-verification "Auxiliary service verification" false
}
phase06(){
  run_gate phase-05-service-verification
  approved_for phase-06-complete || { echo 'Owner approval required before final production completeness gate.' >&2; exit 5; }
  node "$REPO_ROOT/scripts/gizmo-verify-complete.js"
  write_checkpoint phase-06-complete "Complete Gizmo build verification" true
}

case "$PHASE" in
  00) phase00;; 01) phase01;; 02) phase02;; 03) phase03;; 04) phase04;; 05) phase05;; 06) phase06;;
  all) phase00; phase01; phase02; phase03; phase04; phase05; phase06;;
  *) echo 'Usage: gizmo-install.sh [00|01|02|03|04|05|06|all]' >&2; exit 2;;
esac
