#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run this host prerequisite step with sudo.' >&2; exit 1; }

OPERATOR=${SUDO_USER:-}
[[ -n "$OPERATOR" && "$OPERATOR" != root ]] || { echo 'Run via sudo from the intended non-root Gizmo operator account.' >&2; exit 1; }
OPERATOR_GROUP=$(id -gn "$OPERATOR")

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git jq openssl restic age ufw
else
  echo 'Unsupported package manager: this installer currently targets Ubuntu/Debian.' >&2
  exit 1
fi

install -d -m 0750 /etc/gizmo
install -d -o "$OPERATOR" -g "$OPERATOR_GROUP" -m 0750 \
  /srv/gizmo \
  /srv/gizmo/checkpoints \
  /srv/gizmo/catalogs \
  /srv/gizmo/knowledge-vault \
  /srv/gizmo/backups \
  /srv/gizmo/workflow-exports \
  /srv/gizmo/generated

echo "Host prerequisites installed; /srv/gizmo is owned by $OPERATOR:$OPERATOR_GROUP."
echo 'Docker/Node/PM2 are preserved from the existing Agent Foundry install and verified by gizmo-preflight.sh.'
