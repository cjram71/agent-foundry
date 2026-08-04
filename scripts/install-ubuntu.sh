#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

for command in node npm docker gh openssl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing requirement: $command"
    exit 1
  }
done

node -e "const major=Number(process.versions.node.split('.')[0]); if(major<20){throw new Error('Node.js 20.9 or newer is required')}"
docker compose version >/dev/null
gh auth status >/dev/null

if [[ ! -f .env ]]; then
  echo "Create .env from .env.example and fill every required secret before installation."
  exit 1
fi

chmod 600 .env
set -a
source .env
set +a

required=(POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD DATABASE_URL REDIS_PASSWORD JWT_SECRET ADMIN_JWT_SECRET FOUNDRY_REPO_ROOT AGENT_CATALOG_PATH)
for name in "${required[@]}"; do
  value="${!name:-}"
  if [[ -z "$value" || "$value" == *replace_with* ]]; then
    echo "Missing or placeholder value in .env: $name"
    exit 1
  fi
done

install -d -m 700 "$FOUNDRY_REPO_ROOT" "$AGENT_CATALOG_PATH"
docker compose up -d postgres redis
npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run build
npm run test --workspace=apps/runner

if ! command -v pm2 >/dev/null 2>&1; then
  npm install --global pm2
fi

echo "Installation passed."
echo "Next: create an administrator, then run: pm2 start ecosystem.config.cjs && pm2 save"
