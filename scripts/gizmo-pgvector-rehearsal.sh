#!/usr/bin/env bash
set -euo pipefail

: "${PGVECTOR_IMAGE:?Set pinned PGVECTOR_IMAGE}"
: "${POSTGRES_ADMIN_USER:?Set POSTGRES_ADMIN_USER}"
: "${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"
BACKUP=${1:-}
[[ -f "$BACKUP" ]] || { echo 'Usage: gizmo-pgvector-rehearsal.sh /path/to/current-agent-foundry.dump' >&2; exit 2; }

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

docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc "SELECT extversion FROM pg_extension WHERE extname='vector';"
docker exec "$NAME" psql -U gizmo_rehearsal -d agent_foundry_rehearsal -Atc 'SELECT count(*) FROM "Task";' >/dev/null || true

echo 'pgvector restored-copy rehearsal: PASS. This script does NOT cut over production.'
