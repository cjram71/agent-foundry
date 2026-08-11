#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly REPO_ROOT="${GIZMO_UPDATE_REPO:-/home/cory/agent-foundry}"
readonly REMOTE="${GIZMO_UPDATE_REMOTE:-origin}"
readonly BRANCH="${GIZMO_UPDATE_BRANCH:-main}"
readonly REPOSITORY="${GIZMO_GITHUB_REPOSITORY:-cjram71/agent-foundry}"
readonly REQUIRED_CHECK="${GIZMO_REQUIRED_GITHUB_CHECK:-build-and-test}"
readonly STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/gizmo-updater"
readonly CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/gizmo-updater"
readonly LOCK_FILE="$STATE_DIR/update.lock"
readonly STATUS_FILE="$STATE_DIR/status.json"
readonly LOG_FILE="$STATE_DIR/update.log"
readonly CHECK_ONLY="${1:-}"

mkdir -p "$STATE_DIR" "$CACHE_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0
exec >>"$LOG_FILE" 2>&1

json_status() {
  local state="$1" message="$2" current="${3:-}" target="${4:-}"
  node - "$STATUS_FILE" "$state" "$message" "$current" "$target" <<'NODE'
const fs = require('node:fs');
const [file, state, message, current, target] = process.argv.slice(2);
const tmp = `${file}.tmp`;
fs.writeFileSync(tmp, JSON.stringify({ state, message, current, target, observedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, file);
NODE
}

fail() {
  local message="$1"
  echo "BLOCKED: $message"
  json_status blocked "$message" "${CURRENT_SHA:-}" "${TARGET_SHA:-}"
  exit 1
}

cleanup() {
  if [[ -n "${STAGE_DIR:-}" && -d "${STAGE_DIR:-}" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$STAGE_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"
[[ -d .git ]] || fail "repository is missing"
[[ -z "$(git status --porcelain)" ]] || fail "production checkout is dirty"
[[ "$(git remote get-url "$REMOTE")" =~ (github\.com[:/])cjram71/agent-foundry(\.git)?$ ]] || fail "unexpected GitHub remote"

git fetch --quiet --prune "$REMOTE" "$BRANCH"
CURRENT_SHA=$(git rev-parse HEAD)
TARGET_SHA=$(git rev-parse "$REMOTE/$BRANCH")
git merge-base --is-ancestor "$CURRENT_SHA" "$TARGET_SHA" || fail "update is not a fast-forward"

if [[ "$CURRENT_SHA" == "$TARGET_SHA" ]]; then
  echo "SYNC: $CURRENT_SHA"
  json_status synchronized "GitHub and VPS are synchronized" "$CURRENT_SHA" "$TARGET_SHA"
  exit 0
fi

check_json=$(gh api -H 'Accept: application/vnd.github+json' "repos/$REPOSITORY/commits/$TARGET_SHA/check-runs")
node - "$REQUIRED_CHECK" "$check_json" <<'NODE' || fail "required GitHub Actions check is missing or unsuccessful"
const [required, raw] = process.argv.slice(2);
const runs = JSON.parse(raw).check_runs || [];
const valid = runs.some((run) => run.name === required && run.app?.slug === 'github-actions' && run.status === 'completed' && run.conclusion === 'success');
process.exit(valid ? 0 : 1);
NODE

if git diff --name-only "$CURRENT_SHA" "$TARGET_SHA" -- packages/database/prisma/migrations | grep -q .; then
  fail "database migrations changed; human rehearsal and approval are required"
fi

if [[ "$CHECK_ONLY" == "--check-only" ]]; then
  echo "UPDATE AVAILABLE: $CURRENT_SHA -> $TARGET_SHA (GitHub checks passed)"
  json_status update_available "Compatible update is awaiting installation" "$CURRENT_SHA" "$TARGET_SHA"
  exit 0
fi

STAGE_DIR="$CACHE_DIR/stage-$TARGET_SHA"
rm -rf -- "$STAGE_DIR"
git worktree add --quiet --detach "$STAGE_DIR" "$TARGET_SHA"
cd "$STAGE_DIR"

npm ci --ignore-scripts
DATABASE_URL=postgresql://validation:validation@127.0.0.1:5432/validation npx prisma generate --schema packages/database/prisma/schema.prisma
npm audit --omit=dev --audit-level=high
npm run build
npm run build --workspace=apps/dashboard
npm test --workspace=apps/dashboard
npm test --workspace=apps/autonomy
npm test --workspace=apps/orchestrator
npm test --workspace=apps/runner
npm test --workspace=packages/model-router
npm test --workspace=packages/memory-policy
npm test --workspace=packages/agent-contracts
npm test --workspace=packages/github

cd "$REPO_ROOT"
json_status deploying "Validated update is being installed" "$CURRENT_SHA" "$TARGET_SHA"

rollback() {
  local reason="$1"
  echo "ROLLBACK: $reason"
  cd "$REPO_ROOT"
  git reset --hard "$CURRENT_SHA"
  npm ci --ignore-scripts
  npx prisma generate --schema packages/database/prisma/schema.prisma
  npm run build
  npm run build --workspace=apps/dashboard
  pm2 startOrReload ecosystem.config.cjs --update-env
  curl -fsS --max-time 15 http://127.0.0.1:3000/api/health >/dev/null
  json_status rolled_back "$reason" "$CURRENT_SHA" "$TARGET_SHA"
  exit 1
}
trap 'rollback "deployment command failed at line $LINENO"' ERR

git merge --ff-only "$TARGET_SHA"
npm ci --ignore-scripts
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run build
npm run build --workspace=apps/dashboard
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
curl -fsS --retry 8 --retry-delay 2 --retry-connrefused --max-time 15 http://127.0.0.1:3000/api/health >/dev/null
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const required=new Set(["foundry-dashboard","foundry-orchestrator","foundry-runner","foundry-autonomy"]);for(const p of JSON.parse(s)){if(required.has(p.name)&&p.pm2_env.status==="online")required.delete(p.name)}process.exit(required.size?1:0)})'

trap - ERR
json_status synchronized "Update installed and health checks passed" "$TARGET_SHA" "$TARGET_SHA"
echo "UPDATED: $CURRENT_SHA -> $TARGET_SHA"
