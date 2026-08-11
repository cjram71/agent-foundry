#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ "${GIZMO_ALLOW_DATABASE_CHANGES:-false}" == true ]] || { echo 'BLOCKED: GIZMO_ALLOW_DATABASE_CHANGES must be true after backup/restore approval.' >&2; exit 2; }
[[ -n "${DATABASE_URL:-}" ]] || { echo 'DATABASE_URL is required for Prisma migration.' >&2; exit 2; }
cd "$REPO_ROOT"
npx prisma migrate status --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma

echo 'Prisma production migration deploy: PASS'
