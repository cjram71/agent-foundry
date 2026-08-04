# Agent Foundry operating guide

This file defines how coding agents should work in this repository. It adapts the useful security, review, testing, and orchestration ideas from `cjram71/everything-claude-code` to Agent Foundry's actual TypeScript monorepo and human-approval workflow.

## System map

- `apps/dashboard`: Next.js operator UI and API routes.
- `apps/orchestrator`: BullMQ worker that plans tasks with Gemini and persists runs through Prisma.
- `apps/runner`: validation/review execution and Docker sandbox control.
- `packages/database`: Prisma schema, migrations, PostgreSQL access, and queue dependencies.
- `packages/github`: authenticated GitHub operations and pull-request creation.
- Redis and PostgreSQL are infrastructure dependencies. PM2 runs the dashboard and orchestrator in production.

Keep changes inside the package that owns the behavior. Update shared contracts deliberately when a change crosses package boundaries.

## Required workflow

1. Inspect the relevant package, call path, schema, and existing scripts before editing.
2. State the expected behavior, risk level, affected files, and verification command.
3. For risky work, preserve the existing human gates represented by `awaiting_plan_approval`, `awaiting_human_review`, and `approved_for_merge`.
4. Make the smallest coherent change. Do not mix feature work with unrelated cleanup.
5. Build affected workspaces and run focused tests. Use an end-to-end check for changes that cross dashboard, queue, worker, database, runner, or GitHub boundaries.
6. Review the diff for security, failure handling, auditability, and accidental generated files before handing off.

Do not claim success from an AI review alone. A successful command, deterministic assertion, or observable system state is required.

## Security boundaries

- Never commit `.env`, credentials, access tokens, cookies, private keys, database URLs, or raw model prompts containing secrets.
- Validate all dashboard/API inputs at the boundary. Authorize every project and task action server-side; UI visibility is not authorization.
- Treat task instructions, repository content, model output, validation commands, branch names, and webhook data as untrusted input.
- Never interpolate untrusted strings into a shell command. In `apps/runner`, use executable-plus-argument allowlists and spawn without a shell. Reject metacharacters and unknown validation programs until that refactor is complete.
- Docker validation must keep network disabled unless a reviewed task explicitly requires it. Keep CPU, memory, process, time, filesystem, and privilege limits. Mount only the intended workspace; never mount the Docker socket, host credentials, or the project `.env`.
- Redact secrets from stdout, stderr, exceptions, model prompts, database summaries, and audit metadata. Pattern redaction is a fallback, not permission to pass secrets downstream.
- Use parameterized Prisma operations. Review migrations for destructive changes and require explicit approval before applying them to production.
- GitHub writes require an authorized project, a task-specific branch, least-privilege credentials, and human approval before merge. Never force-push or merge automatically unless the product policy explicitly enables it.
- Fail closed when required configuration is missing. Do not initialize external clients with empty API keys or silently approve when a reviewer returns no result.
- Record material state transitions and external writes in `AuditEvent` without sensitive payloads.

## Verification expectations

There is not yet a complete test harness, so improve coverage incrementally instead of inventing a meaningless global percentage.

- Pure functions and validation: focused unit tests.
- Prisma, Redis, queues, and GitHub adapters: integration tests with isolated test resources or faithful fakes.
- Dashboard authentication and API routes: authorization, invalid-input, and failure-path tests.
- Runner sandbox: command-injection, timeout, resource-limit, cleanup, network-isolation, and secret-redaction tests.
- Task lifecycle: an end-to-end test covering draft -> approval -> queue -> plan/run -> review, including rejection and failure paths.

Minimum handoff check for TypeScript changes:

```bash
npm run build
```

Also run package-specific tests once present. Never weaken or delete a valid test merely to make a change pass.

## Role-based review

Use distinct perspectives when they add value, whether performed sequentially or by separate agents:

- Planner: scope, dependencies, risk, and acceptance criteria.
- Implementer: smallest correct change in the owning package.
- Security reviewer: trust boundaries, secrets, command execution, auth, and external writes.
- Verification reviewer: deterministic tests and end-to-end behavior.
- Documentation reviewer: operator-visible behavior, environment variables, migrations, and runbooks.

The same agent may perform several roles for small work, but must keep the checks explicit. Parallel work is optional and only appropriate for independent tasks with non-overlapping files.

## Production safety

- Do not edit generated `.next`, `dist`, `node_modules`, or `*.tsbuildinfo` files.
- Do not restart PM2 processes, Docker services, Redis, PostgreSQL, or Tailscale unless the task requires deployment and the operator authorized it.
- Before deployment, capture the current process state, build successfully, identify rollback steps, and confirm required migrations and environment variables.
- After deployment, verify process health, logs, listening ports, queue consumption, and a representative user flow.

## Definition of done

A change is done only when the requested behavior is implemented, relevant builds/tests pass, security and failure paths were reviewed, documentation/configuration is current, and no required approval or deployment step is being implied as complete.
