#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run this host prerequisite step with sudo.' >&2; exit 1; }

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git jq openssl restic age ufw
else
  echo 'Unsupported package manager: this installer currently targets Ubuntu/Debian.' >&2
  exit 1
fi

install -d -m 0750 /etc/gizmo /srv/gizmo /srv/gizmo/checkpoints /srv/gizmo/catalogs /srv/gizmo/knowledge-vault /srv/gizmo/backups

echo 'Host prerequisites installed. Docker/Node/PM2 are preserved from the existing Agent Foundry install and are verified by gizmo-preflight.sh.'
