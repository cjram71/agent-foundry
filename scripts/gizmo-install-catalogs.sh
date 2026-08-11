#!/usr/bin/env bash
set -euo pipefail

: "${GIZMO_N8N_CATALOG_REPO:?Set GIZMO_N8N_CATALOG_REPO}"
: "${GIZMO_N8N_CATALOG_COMMIT:?Set GIZMO_N8N_CATALOG_COMMIT}"
CATALOG_ROOT="${GIZMO_CATALOG_DIR:-/srv/gizmo/catalogs}/n8n"
TARGET="$CATALOG_ROOT/awesome-n8n-templates"
mkdir -p "$CATALOG_ROOT"

if [[ ! -d "$TARGET/.git" ]]; then
  git clone --filter=blob:none "$GIZMO_N8N_CATALOG_REPO" "$TARGET"
fi

git -C "$TARGET" fetch --prune origin
git -C "$TARGET" cat-file -e "${GIZMO_N8N_CATALOG_COMMIT}^{commit}"
git -C "$TARGET" checkout --detach "$GIZMO_N8N_CATALOG_COMMIT"
ACTUAL=$(git -C "$TARGET" rev-parse HEAD)
[[ "$ACTUAL" == "$GIZMO_N8N_CATALOG_COMMIT" ]] || { echo 'Catalog pin verification failed' >&2; exit 1; }
chmod -R a-w "$TARGET" || true
printf 'Workflow catalog pinned: %s\n' "$ACTUAL"
