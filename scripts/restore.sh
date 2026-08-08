#!/usr/bin/env bash
# P15 restore (docs/BACKUPS.md).
#
#   scripts/restore.sh --verify <backup-dir>     restore into a THROWAWAY
#                                                database and drop it — the
#                                                restore drill, safe to run
#                                                any time
#   scripts/restore.sh --execute <backup-dir>    REAL restore over the
#                                                configured database; asks
#                                                for typed confirmation and
#                                                kicks out live connections
#
# Never prints secrets. Verifies SHA256SUMS before touching anything.
set -Eeuo pipefail

cd "$(dirname "$0")/.."

usage() { sed -n '2,13p' "$0"; exit "${1:-1}"; }
MODE="${1:-}"; BACKUP_DIR="${2:-}"
[[ ( "$MODE" == "--verify" || "$MODE" == "--execute" ) && -n "$BACKUP_DIR" ]] || usage
[[ -d "$BACKUP_DIR" ]] || { echo "restore: no such directory: $BACKUP_DIR" >&2; exit 1; }
[[ -f "$BACKUP_DIR/database.pgdump" && -f "$BACKUP_DIR/SHA256SUMS" ]] || { echo "restore: $BACKUP_DIR is not a complete backup" >&2; exit 1; }

if [[ ! -f .env ]]; then
  echo "restore: .env not found — run this on the Agent Foundry host." >&2
  exit 1
fi
source scripts/load-env.sh
foundry_load_env .env
for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  [[ -n "${!name:-}" ]] || { echo "restore: $name is not set in .env" >&2; exit 1; }
done

PSQL=(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q)
RESTORE=(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i foundry_postgres pg_restore -U "$POSTGRES_USER" --exit-on-error)

as_admin() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i foundry_postgres psql -U "$POSTGRES_USER" "$@"; }

echo "restore: verifying checksums in $BACKUP_DIR"
(cd "$BACKUP_DIR" && sha256sum --check --quiet SHA256SUMS) || { echo "restore: checksum mismatch — refusing to use this backup" >&2; exit 1; }

if [[ "$MODE" == "--verify" ]]; then
  CHECK_DB="${POSTGRES_DB}_restore_check"
  echo "restore: drill into throwaway database $CHECK_DB"
  cleanup_check_db() {
    as_admin -d postgres -q -c "DROP DATABASE IF EXISTS \"$CHECK_DB\"" >/dev/null 2>&1 || true
  }
  trap cleanup_check_db EXIT
  as_admin -d postgres -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$CHECK_DB\"" \
    -c "CREATE DATABASE \"$CHECK_DB\""
  "${RESTORE[@]}" -d "$CHECK_DB" < "$BACKUP_DIR/database.pgdump"
  TABLES=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
    psql -U "$POSTGRES_USER" -d "$CHECK_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  MIGS=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
    psql -U "$POSTGRES_USER" -d "$CHECK_DB" -tAc 'SELECT count(*) FROM "_prisma_migrations"' 2>/dev/null || echo "n/a")
  as_admin -d postgres -q -c "DROP DATABASE \"$CHECK_DB\""
  trap - EXIT
  echo "restore: drill OK — $TABLES public tables, $MIGS migrations recorded. Backup is restorable."
  exit 0
fi

# ---- real restore ----
echo "restore: REAL restore over database \"$POSTGRES_DB\" from $BACKUP_DIR"
echo "restore: stop the application FIRST (pm2 stop ecosystem.config.cjs)"
read -r -p "Type exactly 'restore $POSTGRES_DB' to proceed: " confirmation
[[ "$confirmation" == "restore $POSTGRES_DB" ]] || { echo "restore: not confirmed — nothing was changed."; exit 1; }

echo "restore: terminating live connections"
as_admin -d postgres -q \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid()"

echo "restore: dropping and recreating \"$POSTGRES_DB\""
as_admin -d postgres -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE \"$POSTGRES_DB\"" \
  -c "CREATE DATABASE \"$POSTGRES_DB\""

echo "restore: restoring"
"${RESTORE[@]}" -d "$POSTGRES_DB" < "$BACKUP_DIR/database.pgdump"

MIGS=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT count(*) FROM "_prisma_migrations"' 2>/dev/null || echo "n/a")
echo "restore: OK — $MIGS migrations present. Re-run 'npx prisma migrate deploy' if the app moved forward since the backup, then pm2 restart."
