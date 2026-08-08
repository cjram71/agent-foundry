#!/usr/bin/env bash
# P15 backup (docs/BACKUPS.md): logical PostgreSQL dump + integrity check +
# retention pruning. Run on the Agent Foundry host (cron-friendly).
#
#   scripts/backup.sh
#
# Knobs (env):
#   BACKUP_DIR        target root        (default /srv/agent-foundry/backups)
#   BACKUP_KEEP_DAYS  retention window   (default 14)
#   INCLUDE_ENV=1     also copy .env into the backup dir (see docs warning)
set -Eeuo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "backup: .env not found — run this on the Agent Foundry host." >&2
  exit 1
fi
source scripts/load-env.sh
foundry_load_env .env

for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  if [[ -z "${!name:-}" ]]; then
    echo "backup: $name is not set in .env" >&2
    exit 1
  fi
done

BACKUP_DIR="${BACKUP_DIR:-/srv/agent-foundry/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/$STAMP"

# Only one backup at a time.
install -d -m 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  echo "backup: another backup is already running" >&2
  exit 1
fi

install -d -m 700 "$TARGET"
# A failed dump must never leave a plausible-looking backup behind.
trap 'rm -rf "$TARGET"' ERR

echo "backup: dumping ${POSTGRES_DB} (logical, custom format) at ${STAMP}"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 \
  > "$TARGET/database.pgdump"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
  pg_dumpall -U "$POSTGRES_USER" --globals-only \
  > "$TARGET/globals.sql"

# Integrity gate #1: the dump must list cleanly (catches truncation).
docker exec -i foundry_postgres pg_restore --list < "$TARGET/database.pgdump" > "$TARGET/restore-list.txt"

MIGRATIONS="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" foundry_postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT count(*) FROM "_prisma_migrations"')"

if [[ "${INCLUDE_ENV:-0}" == "1" ]]; then
  install -m 600 .env "$TARGET/env.backup"
  echo "backup: .env copied into the backup (INCLUDE_ENV=1) — protect $TARGET like a secret." >&2
fi

# Manifest + checksums (integrity gate #2 for restores).
{
  echo "created_utc=$STAMP"
  echo "database=$POSTGRES_DB"
  echo "migrations_applied=$MIGRATIONS"
  echo "include_env=${INCLUDE_ENV:-0}"
} > "$TARGET/manifest.txt"
chmod 600 "$TARGET"/* 2>/dev/null || true
(cd "$TARGET" && sha256sum database.pgdump globals.sql manifest.txt > SHA256SUMS)

# Retention: only timestamped directories we created, older than KEEP_DAYS.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex "$BACKUP_DIR/[0-9]{8}T[0-9]{6}Z" \
  -mtime "+$KEEP_DAYS" -exec rm -rf {} +

trap - ERR
echo "backup: OK -> $TARGET"
echo "backup: verify any time with: scripts/restore.sh --verify $TARGET"
