# Safe VPS updates

`scripts/gizmo-safe-update.sh` is a pull-based updater for the production checkout. It does not accept inbound webhooks and does not expose an HTTP deployment endpoint.

## Gates

An update is installed only when all of the following are true:

- the checkout is clean and the configured remote is `cjram71/agent-foundry`;
- `origin/main` is a strict fast-forward from the deployed commit;
- the exact target commit has a successful `build-and-test` check from GitHub Actions;
- no Prisma migration file changed;
- locked dependency installation succeeds with package scripts disabled;
- `npm audit --omit=dev --audit-level=high` finds no high/critical production vulnerability;
- monorepo, dashboard, autonomy, orchestrator, runner, model router, memory policy, agent contract, and GitHub adapter builds/tests pass in an isolated Git worktree;
- the production build succeeds and all four PM2 processes plus `/api/health` are healthy.

Database migrations, host packages, Docker, firewall rules, secrets, and system services are never changed automatically. A failed post-switch health check rolls the application checkout and build back to the previously deployed commit.

## Operations

- Status: `cat ~/.local/state/gizmo-updater/status.json`
- Log: `tail -100 ~/.local/state/gizmo-updater/update.log`
- Check only: `scripts/gizmo-safe-update.sh --check-only`
- Disable: remove the marked updater line from `crontab -e`

The cron job runs as the unprivileged `cory` user every ten minutes. `flock` prevents overlapping updates.
