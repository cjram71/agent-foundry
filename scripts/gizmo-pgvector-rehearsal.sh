#!/usr/bin/env bash
set -euo pipefail

: "${PGVECTOR_IMAGE:?Set pinned PGVECTOR_IMAGE}"
: "${POSTGRES_ADMIN_USER:?Set POSTGRES_ADMIN_USER}"
: "${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"
BACKUP=${1:-}
[[ -f "$BACKUP" ]] || { echo 'Usage: gizmo-pgvector-rehearsal.sh /path/to/current-agent-foundry.dump' >&2; exit 2; }
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MIGRATION=${2:-$REPO_ROOT/packages/database/prisma/migrations/20260812000200_add_pgvector_memory/migration.sql}
[[ -f "$MIGRATION" ]] || { echo "Missing pgvector migration: $MIGRATION" >&2; exit 2; }

NAME=gizmo_pgvector_rehearsal
PORT=55432
PW=$(openssl rand -hex 24)
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_USER=gizmo_rehearsal -e POSTGRES_DB=agent_foundry_rehearsal -p "127.0.0.1:${PORT}:5432" "$PGVECTOR_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U gizmo_rehearsal >/dev/null 2>&1 && break
  sleep 1
done

docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;'
cat "$BACKUP" | docker exec -i "$NAME" pg_restore --clean --if-exists --no-owner -U gizmo_rehearsal -d agent_foundry_rehearsal
cat "$MIGRATION" | docker exec -i "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -v ON_ERROR_STOP=1 >/dev/null

docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc "SELECT extversion FROM pg_extension WHERE extname='vector';"
docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc 'SELECT count(*) FROM "Task";' >/dev/null
docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc "SELECT format_type(a.atttypid,a.atttypmod) FROM pg_attribute a WHERE a.attrelid='\"MemoryRecord\"'::regclass AND a.attname='embedding';" | grep -qx 'vector(1536)'
docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc "SELECT to_regclass('\"MemoryRecord_searchVector_idx\"') IS NOT NULL AND to_regclass('\"MemoryRecord_embedding_hnsw_idx\"') IS NOT NULL;" | grep -qx t
docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc "SELECT round((1 - ('[1,0,0]'::vector <=> '[1,0,0]'::vector))::numeric,3);" | grep -qx '1.000'

echo 'pgvector restored-copy + candidate migration rehearsal: PASS. This script does NOT cut over production.'
