#!/usr/bin/env bash
# vps-inspection.sh — READ-ONLY Agent Foundry VPS baseline inspection.
#
# Run as the Agent Foundry service user on the VPS (e.g. inside
# /home/cory/agent-foundry). It modifies nothing, prints no secret VALUES,
# and writes a single report file (mode 0600) you can paste back.
#
# Usage:  bash scripts/vps-inspection.sh [repo-dir]
set -Eeuo pipefail
umask 077
export LC_ALL=C

REPO_DIR="${1:-$PWD}"
REPORT="${HOME}/agent-foundry-inspection-$(date -u +%Y%m%dT%H%M%SZ).txt"

log()  { printf '%s\n' "$*" | tee -a "$REPORT"; }
sect() { printf '\n===== %s =====\n' "$*" | tee -a "$REPORT"; }
run()  { # run cmd, capture output into report, never fail the script
  printf '$ %s\n' "$*" >>"$REPORT"
  "$@" >>"$REPORT" 2>&1 || printf '[unavailable or failed: exit %s]\n' "$?" >>"$REPORT"
}

# Source .env into the shell if present, without printing any values.
ENV_FILE="$REPO_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  source "$REPO_DIR/scripts/load-env.sh"
  foundry_load_env "$ENV_FILE"
fi

: >"$REPORT"
log "Agent Foundry VPS inspection — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "Report file: $REPORT (mode 600). Do not paste .env contents or secrets."

sect "1. Operating system"
run head -4 /etc/os-release
run uname -srm
run uptime

sect "2. Runtime versions"
run node -v
run npm -v
run git --version
run docker --version
run pm2 -v
run gh --version

sect "3. Repository state ($REPO_DIR)"
run git -C "$REPO_DIR" remote -v
run git -C "$REPO_DIR" branch --show-current
run git -C "$REPO_DIR" rev-parse HEAD
run git -C "$REPO_DIR" status --porcelain=v1 --untracked-files=all
run git -C "$REPO_DIR" log -3 --format='%h %ad %s' --date=iso-strict

sect "4. GitHub CLI auth (account and scopes only; token values are never shown)"
run gh auth status

sect "5. Docker services (names, status, published port bindings only)"
run docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
if [[ -f "$REPO_DIR/docker-compose.yml" ]]; then
  (cd "$REPO_DIR" && docker compose ps >>"$REPORT" 2>&1) || printf '[docker compose ps failed]\n' >>"$REPORT"
fi

sect "6. PM2 processes (names and status only)"
run pm2 jlist
run pm2 status

sect "7. Listening ports (bind addresses)"
run ss -tln

sect "8. Ollama (if installed)"
run curl -sS --max-time 3 http://127.0.0.1:11434/api/tags

sect "9. Required environment variables (presence only — values are NEVER printed)"
if [[ -f "$REPO_DIR/.env" ]]; then
  log ".env file: present (mode $(stat -c %a "$REPO_DIR/.env"))"
  REQUIRED_VARS=(PORT NODE_ENV APP_URL JWT_SECRET POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD DATABASE_URL REDIS_PASSWORD REDIS_URL GITHUB_CLI_ENABLED GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL FOUNDRY_REPO_ROOT AGENT_CATALOG_PATH GEMINI_API_KEY OLLAMA_URL OLLAMA_MODEL SANDBOX_IMAGE SANDBOX_MEMORY SANDBOX_CPUS)
  for name in "${REQUIRED_VARS[@]}"; do
    value="${!name:-}"
    if [[ -z "$value" ]]; then state="MISSING"
    elif [[ "$value" == *replace_with* ]]; then state="PLACEHOLDER (must be replaced)"
    else state="SET (length ${#value})"; fi
    printf '%-24s %s\n' "$name" "$state" >>"$REPORT"
  done
else
  log ".env file: MISSING"
fi

sect "10. Workspace and catalog paths"
for var in FOUNDRY_REPO_ROOT AGENT_CATALOG_PATH; do
  dir="${!var:-}"
  if [[ -n "$dir" && -d "$dir" ]]; then
    log "$var=$dir exists: $(du -sh "$dir" 2>/dev/null | cut -f1) used, $(find "$dir" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l) entries"
  else
    log "$var: not set or directory missing"
  fi
done
run df -h / /srv /home

sect "11. Database"
psql_exec() { # prefer trust-auth inside the postgres container; fall back to host psql with password from .env (never echoed)
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'foundry_postgres'; then
    docker exec -i foundry_postgres psql -U "${POSTGRES_USER:-foundry_admin}" -d "${POSTGRES_DB:-agent_foundry}" -v ON_ERROR_STOP=0 -Atc "$1" 2>&1
  elif command -v psql >/dev/null 2>&1; then
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h 127.0.0.1 -U "${POSTGRES_USER:-foundry_admin}" -d "${POSTGRES_DB:-agent_foundry}" -v ON_ERROR_STOP=0 -Atc "$1" 2>&1
  else
    printf '[no database client available]\n'
  fi
}
{
  printf '$ SELECT version()\n';  psql_exec 'SELECT version();'
  printf '$ database size\n';     psql_exec "SELECT pg_size_pretty(pg_database_size(current_database()));"
  printf '$ _prisma_migrations content\n'
  psql_exec "SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at;" 2>/dev/null || true
  printf '$ users (count only — no emails, no hashes)\n'
  psql_exec 'SELECT COUNT(*) AS user_count FROM "User";'
  psql_exec 'SELECT "role", COUNT(*) FROM "User" GROUP BY "role";'
  printf '$ projects\n'
  psql_exec 'SELECT COUNT(*), COUNT(*) FILTER (WHERE "authorisedStatus") AS authorised FROM "Project";'
  printf '$ task status breakdown\n'
  psql_exec 'SELECT status, COUNT(*) FROM "Task" GROUP BY status ORDER BY status;'
  printf '$ schema drift probes\n'
  psql_exec "SELECT 'Project.' || column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name IN ('githubRepo','githubRepository');"
  psql_exec "SELECT 'AgentRun.' || column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name IN ('errorInfo','errorInformation','updatedAt','promptHash');"
  psql_exec "SELECT 'Role enum exists' WHERE EXISTS (SELECT 1 FROM pg_type WHERE typname='Role');"
  psql_exec "SELECT conname || ' -> ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND conname IN ('Task_projectId_fkey','AgentRun_taskId_fkey','Approval_taskId_fkey');"
} >>"$REPORT" 2>&1

sect "12. Tailscale (if installed)"
run tailscale ip -4

sect "13. Secret-pattern self-check of this report"
if grep -Eqi 'AIzaSy[0-9A-Za-z_-]{33}|ghp_[0-9A-Za-z_]{20,}|github_pat_[0-9A-Za-z_]{20,}|BEGIN [A-Z ]*PRIVATE KEY|(password|secret|token)[=:][^ ]{8,}' "$REPORT"; then
  log "WARNING: possible secret material detected in this report. Redact before sharing."
else
  log "PASS: no provider-key or credential patterns detected in this report."
fi

log ""
log "Inspection complete. Attach $REPORT to the handover. It contains no secret values."
