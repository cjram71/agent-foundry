# Backups & Restore (P15)

RPO/RTO and the drill. Scripts: `scripts/backup.sh`, `scripts/restore.sh`
(run on the Agent Foundry host; nothing here runs from CI).

## What is backed up — and what is deliberately not

| Data | Backed up? | Why |
| --- | --- | --- |
| **PostgreSQL** (`agent_foundry`: tasks, attempts, transitions, events, approvals, audits, sessions, policies) | ✅ logical `pg_dump -Fc` + `pg_dumpall --globals-only` | The irreplaceable system of record |
| Redis (queues, emergency-stop flag) | ❌ | Ephemeral by design: queues re-derive from DB state; a flushed redis costs in-flight work only, never history |
| Repo workspaces (`FOUNDRY_REPO_ROOT`) | ❌ | Re-clonable from GitHub; branches that matter are pushed |
| Agent catalog clone | ❌ | Re-clone + checkout the pinned `AGENT_CATALOG_COMMIT` |
| `.env` | ⚠️ opt-in (`INCLUDE_ENV=1`) | Contains every secret. Off by default so backups don't casually become secret stores; when enabled the backup dir must be protected like a secret (it is 0700, files 0600) |

## Policy (recommended baseline)

- **Schedule:** daily. Cron example:
  ```
  17 3 * * * /home/cory/agent-foundry/scripts/backup.sh >> /var/log/foundry-backup.log 2>&1
  ```
- **Retention:** 14 days (`BACKUP_KEEP_DAYS`), timestamped dirs under
  `BACKUP_DIR` (default `/srv/agent-foundry/backups`, mode 0700).
- **Off-host:** for anything you actually care about, sync the backup dir to
  encrypted off-host storage (rsync/rclone) — the scripts lay it out cleanly;
  they deliberately do not bake in a destination.
- **RPO/RTO:** daily schedule ⇒ RPO 24 h; restore drill times are minutes ⇒
  RTO well under an hour. Point-in-time recovery (WAL archiving) is future
  hardening, not part of the beta.

## Safety mechanics in the scripts

- `flock` against concurrent backups; `trap ERR` removes a partial backup
  directory so a failed dump never masquerades as a good one.
- **Two integrity gates:** `pg_restore --list` must parse the dump at backup
  time; restores refuse to proceed unless `sha256sum -c SHA256SUMS` passes.
- Retention `find` only matches the script's own timestamped directory
  pattern — it cannot delete anything else under `BACKUP_DIR`.
- Secrets never print: passwords pass via `docker exec -e` (transient env of
  the exec process — the standard caveat for docker-hosted databases).
- The real restore requires typing `restore <dbname>` and tells you to stop
  the app first.

## Restore drill (run it quarterly — untested restores are not backups)

```bash
scripts/restore.sh --verify /srv/agent-foundry/backups/<STAMP>
```

Restores into a throwaway database, counts public tables + recorded
migrations, drops it. If the drill passes, the backup is restorable.

## Real restore

```bash
pm2 stop ecosystem.config.cjs
scripts/restore.sh --execute /srv/agent-foundry/backups/<STAMP>
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma   # if the app moved forward
pm2 restart ecosystem.config.cjs
```

## Verification status

- [VERIFIED] `bash -n` clean on both scripts; structure reviewed against the
  compose service/container names (`foundry_postgres`).
- [MISSING ACCESS] an end-to-end dump/restore needs the live VPS postgres —
  first `backup.sh` + `--verify` run on the host is the operator's drill
  (listed as a beta scenario in docs/BETA.md).
