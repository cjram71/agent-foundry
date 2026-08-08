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
source scripts/load-env.sh
foundry_load_env .env

required=(POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD DATABASE_URL REDIS_PASSWORD JWT_SECRET FOUNDRY_REPO_ROOT AGENT_CATALOG_PATH)
for name in "${required[@]}"; do
  value="${!name:-}"
  if [[ -z "$value" || "$value" == *replace_with* ]]; then
    echo "Missing or placeholder value in .env: $name"
    exit 1
  fi
done

install -d -m 700 "$FOUNDRY_REPO_ROOT" "$AGENT_CATALOG_PATH"

# Provision and pin the agent role catalog (P9; docs/ROLE-CATALOG.md). The
# orchestrator verifies this checkout against AGENT_CATALOG_COMMIT at plan
# time and fails closed on mismatch, so installation must leave the clone at
# the pinned commit.
if [[ ! -d "$AGENT_CATALOG_PATH/.git" ]]; then
  if [[ -n "$(ls -A "$AGENT_CATALOG_PATH")" ]]; then
    echo "AGENT_CATALOG_PATH exists but is not a catalog clone; clear it or fix the path."
    exit 1
  fi
  git clone https://github.com/cjram71/500-AI-Agents-Projects "$AGENT_CATALOG_PATH"
fi
if [[ -n "${AGENT_CATALOG_COMMIT:-}" && "${AGENT_CATALOG_COMMIT:-}" != *replace_with* ]]; then
  git -C "$AGENT_CATALOG_PATH" fetch --quiet origin
  git -C "$AGENT_CATALOG_PATH" checkout --quiet --detach "$AGENT_CATALOG_COMMIT"
fi

docker compose up -d postgres redis
# Pre-pull the validation sandbox image so the first task validation never
# pays a cold-pull inside its timeout (P8; matches SandboxController.ensureImage).
docker pull "${SANDBOX_IMAGE:-node:20-bookworm-slim}"
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
