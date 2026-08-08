# Validation Engine (P10)

How Agent Foundry proves that AI-generated changes actually work before a human
is asked to review them. Owner: `apps/runner/src/validation.ts`
(`runValidationPipeline`, `deriveValidationCommands`), executed through
`apps/runner/src/sandbox.ts` (`SandboxController`).

## The two-stage rule

Validation entails two fundamentally different activities, and the engine gives
them different environments:

| Stage | Environment | Why |
| --- | --- | --- |
| `dependencies` — `npm install --ignore-scripts --no-package-lock --no-audit --no-fund` | Container **with network** (registry reachable), lifecycle scripts disabled, repo mounted directly (`persistToRepo`) | Dependency resolution needs the registry. `--ignore-scripts` means **no package or repository code executes during the networked stage** — the container is a fetch engine, not a runtime. `node_modules` must persist for later stages, so the repo is mounted directly. |
| `command:N` — `npm run lint/typecheck/test/build` | Container with **`--network none`** and an isolated copy of the repo (default posture from P8) | Repository + dependency code *executes* here (that is the point of testing) — so it runs with zero network, in a disposable workspace. |

Pre-P10, the install ran as a plain `npm install` **on the runner host**. That
was P8's documented residual risk: npm itself (reading attacker-influenced
registry responses and package metadata) executed with host privileges.
P10 closes it — nothing npm executes ever runs on the host anymore; the only
stage with network executes no fetched code, and the only stages that execute
fetched code have no network. (Exfiltration channel for a malicious
dependency: it runs inside `--network none`, sees a filtered copy with no
`.git`/`.env*`/keys, and cannot reach the host. See
`docs/RUNNER-ISOLATION.md`.)

## Command derivation

`deriveValidationCommands(repoPath)` reads `package.json` and keeps the
allowlisted scripts in canonical order: **lint → typecheck → test → build**.
Determinism properties:

- The set is repo-derived, never model-chosen (the coder/planner only write
  files; the engine decides what proves them).
- `package.json` is bounded: ≤ 1 MB, `scripts` must be an object with ≤ 64
  entries, absent/invalid manifests fail with precise messages.
- At most 8 pipeline commands ever run per task.

The **last** derived command is reserved for the reviewer's own isolated run
(`ReviewerAgent.reviewAndValidate`), unchanged from pre-P10 — the engine runs
`commands.slice(0, -1)`. Restructuring that reviewer split is P12 scope, so a
single-script repo still performs one combined validation+review execution.

## Pipeline semantics

`runValidationPipeline({ sandbox, taskId, repoPath, commands, install? })`:

1. `dependencies` stage (default on; timeout 240 s, `SANDBOX_INSTALL_TMPFS`
   for npm-cache tmpfs, default `1g`).
2. `command:1..N` stages in order (180 s each), **stopping at the first
   failure** — later stages never run against a broken workspace.
3. Stage failures never throw; they return `ValidationReport { ok, stages,
   failedStage }` with per-stage `command`, `exitCode`, `durationMs`, and a
   2 KB `outputTail`. The worker throws `ValidationStageError` (which carries
   the report) exactly once, at the boundary where failure becomes task
   state.

## Recording

The worker turns reports into durable facts (additive payload fields only):

- `validation_failed` payload: `{ stage, command, exitCode, durationMs }` —
  including install failures (`stage: "dependencies"`), which previously
  produced no validation event at all.
- `validation_passed` payload: `{ commands, stages: [{ stage, command,
  exitCode, durationMs }] }`.
- `task_failed` stage attribution is now precise: `validation:dependencies`
  or `validation:command:N` instead of the old `workspace` heuristic for
  those paths.

## Tests and verification

- 9 offline unit tests (`validation.test.ts`): stage option wiring
  (network ↔ persistToRepo pairing, offline validation defaults), ordering,
  stop-on-first-failure, install short-circuit, empty-command install-only
  pipeline, pipeline size bound, error structure, command derivation order,
  manifest bounds.
- 1 Docker-gated integration test (`sandbox.test.ts`): the real install stage
  against a fixture with a dependency **and a malicious `postinstall` script**
  — asserts node_modules persists host-side, no lockfile is written, and the
  lifecycle script never executes. Runs unskipped in CI.
- Local: 9 pass + 2 honest skips (Docker-dependent), `tsc --build` green.

## Residual risks

- The `dependencies` stage trusts the npm registry response itself (a
  compromised registry serves poisoned packages that are then *executed*
  offline and fail validation — annoying, not a breach). Lockfile-pinned,
  hash-verified installs (`npm ci` against a committed lockfile) are the next
  hardening step; `--no-package-lock` today because generated workspaces have
  no lockfile.
- npm cache lives in the stage tmpfs and vanishes with the container; installs
  re-download per task. A registry-caching proxy is an optimization, not a
  security control.
