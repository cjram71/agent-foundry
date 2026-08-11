#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_ADMIN_USER:?Set POSTGRES_ADMIN_USER}"
: "${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"
: "${N8N_DB_NAME:?Set N8N_DB_NAME}"
: "${N8N_DB_USER:?Set N8N_DB_USER}"
: "${N8N_DB_PASSWORD:?Set N8N_DB_PASSWORD}"

[[ "$N8N_DB_NAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo 'Invalid N8N_DB_NAME' >&2; exit 2; }
[[ "$N8N_DB_USER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo 'Invalid N8N_DB_USER' >&2; exit 2; }
[[ "$N8N_DB_PASSWORD" =~ ^[A-Za-z0-9._~+-]{24,128}$ ]] || { echo 'N8N_DB_PASSWORD must be 24-128 safe random characters; hexadecimal/base64url-style recommended.' >&2; exit 2; }
[[ "${GIZMO_ALLOW_DATABASE_CHANGES:-false}" == "true" ]] || {
  echo 'BLOCKED: set GIZMO_ALLOW_DATABASE_CHANGES=true only after backup/restore checkpoint approval.' >&2
  exit 2
}

docker ps --format '{{.Names}}' | grep -qx foundry_postgres || { echo 'foundry_postgres is not running' >&2; exit 1; }

SQL=$(cat <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${N8N_DB_USER}') THEN
    CREATE ROLE ${N8N_DB_USER} LOGIN PASSWORD '${N8N_DB_PASSWORD}';
  ELSE
    ALTER ROLE ${N8N_DB_USER} WITH LOGIN PASSWORD '${N8N_DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${N8N_DB_NAME} OWNER ${N8N_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${N8N_DB_NAME}')\gexec
REVOKE ALL ON DATABASE ${N8N_DB_NAME} FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE ${N8N_DB_NAME} TO ${N8N_DB_USER};
SQL
)

docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" -i foundry_postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_ADMIN_USER" -d postgres <<<"$SQL"

echo 'n8n database/user provisioning: PASS'
