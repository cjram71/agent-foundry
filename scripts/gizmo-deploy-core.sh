#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run build
npm run build --workspace=apps/dashboard
npm test --workspace=apps/autonomy
npm test --workspace=apps/orchestrator
npm test --workspace=apps/runner
npm test --workspace=packages/model-router
npm test --workspace=packages/memory-policy
npm test --workspace=packages/agent-contracts
npm test --workspace=packages/github

# Database migrations are deliberately separate because they are consequential.
# This deployment command starts only already-built code against an already-approved schema.
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null

echo 'Gizmo/Agent Foundry core build and PM2 deployment: PASS'
