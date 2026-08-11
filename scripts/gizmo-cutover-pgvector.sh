#!/usr/bin/env bash
set -Eeuo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LIVE_ENV=${LIVE_ENV:-/home/cory/agent-foundry/.env}
CHECKPOINT=${PGVECTOR_REHEARSAL_CHECKPOINT:-/srv/gizmo/checkpoints/phase-06-pgvector-rehearsal.json}
TARGET_IMAGE='pgvector/pgvector:0.8.2-pg16-bookworm@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc'
OLD_IMAGE='postgres:16-alpine'

[[ "${GIZMO_ALLOW_DATABASE_CHANGES:-false}" == true ]] || { echo 'BLOCKED: database change approval flag is false' >&2; exit 2; }
[[ "${PGVECTOR_CUTOVER_APPROVED:-false}" == true ]] || { echo 'BLOCKED: pgvector cutover approval flag is false' >&2; exit 2; }
[[ -f "$LIVE_ENV" ]] || { echo "Missing live env: $LIVE_ENV" >&2; exit 2; }
node "$REPO_ROOT/scripts/gizmo-checkpoint-gate.js" "$CHECKPOINT"
source "$REPO_ROOT/scripts/load-env.sh"
foundry_load_env "$LIVE_ENV"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

current_image=$(docker inspect foundry_postgres --format '{{.Config.Image}}')
[[ "$current_image" == "$OLD_IMAGE" || "$current_image" == "$TARGET_IMAGE" ]] || { echo "REFUSED: unexpected current PostgreSQL image: $current_image" >&2; exit 3; }
docker inspect foundry_postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' | grep -qx 'agent-foundry_postgres_data'

migrations_started=false
rollback_pre_migration(){
  rc=$?
  if [[ $rc -ne 0 && "$migrations_started" == false ]]; then
    echo 'Cutover failed before migrations; recreating PostgreSQL with prior image.' >&2
    PGVECTOR_IMAGE="$OLD_IMAGE" docker compose -p agent-foundry --env-file "$LIVE_ENV" -f "$REPO_ROOT/docker-compose.yml" up -d --no-deps --force-recreate postgres || true
  fi
  exit "$rc"
}
trap rollback_pre_migration EXIT

PGVECTOR_IMAGE="$TARGET_IMAGE" docker compose -p agent-foundry --env-file "$LIVE_ENV" -f "$REPO_ROOT/docker-compose.yml" up -d --no-deps --force-recreate postgres
for _ in $(seq 1 60); do
  docker exec foundry_postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 && break
  sleep 1
done
docker exec foundry_postgres pg_isready -U "$POSTGRES_USER" >/dev/null

migrations_started=true
cd "$REPO_ROOT"
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma
docker exec foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT extversion FROM pg_extension WHERE extname='vector';" | grep -qx '0.8.2'
docker exec foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT to_regclass('\"MemoryRecord_embedding_hnsw_idx\"') IS NOT NULL;" | grep -qx t
docker exec foundry_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'SELECT 1;' | grep -qx 1
if ss -ltn | grep -qE '127\.0\.0\.1:3000[[:space:]]'; then
  curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null
else
  echo 'Dashboard health probe skipped: no service is listening on 127.0.0.1:3000.'
fi
trap - EXIT
echo 'pgvector production cutover and pending Prisma migrations: PASS'
