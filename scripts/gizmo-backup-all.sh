#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BACKUP_DIR=${GIZMO_BACKUP_DIR:-/srv/gizmo/backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR/$STAMP"

bash "$REPO_ROOT/scripts/backup.sh"

if docker ps --format '{{.Names}}' | grep -qx foundry_postgres && [[ -n "${N8N_DB_NAME:-}" && -n "${POSTGRES_ADMIN_USER:-}" ]]; then
  docker exec foundry_postgres pg_dump -U "$POSTGRES_ADMIN_USER" -Fc "$N8N_DB_NAME" > "$BACKUP_DIR/$STAMP/n8n.dump"
fi

[[ -d "${GIZMO_KNOWLEDGE_DIR:-/srv/gizmo/knowledge-vault}" ]] && tar -C "${GIZMO_KNOWLEDGE_DIR:-/srv/gizmo/knowledge-vault}" -czf "$BACKUP_DIR/$STAMP/knowledge-vault.tgz" .
[[ -d "${GIZMO_CATALOG_DIR:-/srv/gizmo/catalogs}" ]] && tar -C "${GIZMO_CATALOG_DIR:-/srv/gizmo/catalogs}" -czf "$BACKUP_DIR/$STAMP/catalog-metadata.tgz" --exclude='.git/objects' .

( cd "$BACKUP_DIR/$STAMP" && sha256sum * > SHA256SUMS )

if [[ -n "${RESTIC_REPOSITORY:-}" && -n "${RESTIC_PASSWORD:-}" ]]; then
  restic backup "$BACKUP_DIR/$STAMP"
fi

echo "Gizmo backup complete: $BACKUP_DIR/$STAMP"
