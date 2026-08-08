# Runner Isolation (P8)

How Agent Foundry runs **untrusted validation commands** (build/test/typecheck over
AI-generated changes) without letting them touch the runner host. Owner:
`apps/runner/src/sandbox.ts` (`SandboxController`). Single shared boundary — the
execution worker's validation loop and `ReviewerAgent.reviewAndValidate` both go
through `executeInSandbox`; there is no second, weaker path.

## Trust model

The coding stage produces arbitrary file diffs. Validating them means *executing
the repository* (`npm test`, `node …`) with attacker-influenceable content. The
sandbox is the security boundary between that code and the runner host, which holds
DB credentials, GitHub tokens, and other tasks' workspaces.

## Isolation posture (`docker run` flags)

| Control | Value |
| --- | --- |
| Network | `--network none` — no egress at all; supply-chain payloads cannot phone home |
| Root filesystem | `--read-only` |
| Capabilities | `--cap-drop ALL` + `--security-opt no-new-privileges` |
| PIDs / memory / CPU | `--pids-limit 128`, `--memory $SANDBOX_MEMORY` (default `2g`), `--cpus $SANDBOX_CPUS` (default `1.5`) |
| Writable space | bind-mounted workspace at `/workspace:rw` (needed for build artifacts) + `--tmpfs /tmp` 64 MB `noexec,nosuid` as `HOME` |
| Identity | `--user <invoking uid>:<invoking gid>` (see below) |
| Lifecycle | fresh container per run, `--rm`, plus a `docker rm -f` in `finally` (10 s budget) — no container survives success, failure, or timeout |
| Shell | none — `spawn(executable, args, { shell: false })` from the worker straight to `docker run`; shell metacharacters are inert data (covered by test 1) |

## Command admission

- Executable allowlist: `npm`, `node`, `npx` only — nothing else reaches the daemon.
- Argument validation: ≤ 32 args, each ≤ 512 chars, no NUL/CR/LF.
- Selection of *which* commands run is deterministic (repo-derived
  `validationCommands()`), not model-chosen.

## Repository-path gate

Before anything is copied or spawned, `validateRepoPath` resolves the requested
path with `realpath` and requires containment under `FOUNDRY_REPO_ROOT`
(default `/tmp/foundry-repos`): `..` escapes, absolute escapes, symlinks pointing
outside, and non-directories are all rejected. Covered by test 2.

## Workspace hygiene

Each run copies the repo into a fresh host dir `/tmp/foundry-sandbox-<task>-<ts>`
(mode `0700`) and deletes it afterwards (`finally`, `rm -rf`). The copy filter
excludes `.git/`, `.next/`, `dist/`, `coverage/`, any `.env*` file, and
`*.pem` / `*.key` / `*.p12` — the container never sees git history (credentials in
reflog/remotes) or operator secrets. Symlinks are copied verbatim (no
follow-out-of-tree).

## Container uid model (the P8 fix)

The container runs as the **invoking user's numeric uid:gid**
(`process.getuid()/getgid()`, fallback `1000`), never a hardcoded id. The
bind-mounted workspace is host-created with mode `0700`, so only its owner can
enter it — if the container's uid differs from the runner process's uid, every
validation fails before the payload even starts. That is exactly what the old
hardcoded `--user 1000:1000` did on hosts where the runner isn't uid 1000
(GitHub Actions runners use uid 1001 → the sandbox suite was red from repo birth
until P8). A numeric uid with no `/etc/passwd` entry is safe: `HOME` is supplied
explicitly via `--env HOME=/tmp`.

## Image handling

`SANDBOX_IMAGE` (default `node:20-bookworm-slim`) is verified runnable **before**
the caller's timeout clock starts: `ensureImage()` does `docker image inspect`
(15 s) and, if absent, `docker pull` (240 s). Without this, a fresh host's first
validation paid a cold image pull inside its 60–180 s budget and flaked. The same
image is pre-pulled at provision time by `scripts/install-ubuntu.sh`, so a
correctly installed VPS never exercises the pull path.

## Output hygiene

- stdout+stderr are captured only up to **1 MB**, then `[OUTPUT TRUNCATED]`.
- Secret redaction before anything is returned/persisted: Gemini keys
  (`AIzaSy…`), GitHub tokens (`ghp_…`, `github_pat_…`), `postgres(ql)://` and
  `redis://` embedded credentials, and `Authorization: Bearer/Basic` headers.
- Timeouts: the caller's `timeoutMs` is enforced by `spawn(timeout)`; a timed-out
  run reports `exitCode: 124` with a `Validation timed out.` marker.

## Residual risks (accepted, documented)

1. **Host-side preflight install.** The runner executes
   `npm install --ignore-scripts --no-package-lock --no-audit --no-fund` on the
   host copy before validation (validation needs `node_modules`). Lifecycle
   scripts are disabled, so dependency code does not *execute* on the host — it
   can only run later, inside the network-less container. Moving preflight into
   the container is validation-engine work, scheduled for P10.
2. **Docker = root-equivalent.** Anyone who can reach the Docker socket owns the
   host; the daemon is trusted. Standard Docker deployment caveat, mitigated by
   the runner being a dedicated service account.
3. **Image pinned by tag, not digest.** Operators can point `SANDBOX_IMAGE` at a
   digest; digest-pinning by default is possible future hardening.
4. **DoS bounds are defaults, not proofs.** The flags above bound cpu/mem/pids/
   writable disk, but a validation that fills its workspace within those bounds
   still just fails its own task — which is the correct blast radius.

## Tests and their gating semantics

`apps/runner/src/sandbox.test.ts` follows the same honest-integration pattern as
the dashboard's `TEST_DATABASE_URL` tests:

- **Test 1 (metacharacters / Docker boundary)** runs the real daemon and is
  **skipped** when `docker --version` is unavailable (local dev without Docker),
  rather than failing. It asserts (a) the command succeeds, (b) output is
  returned, and (c) a `touch /tmp/host-marker` smuggled as extra argv never
  appears on the host — no shell ever interprets it.
- **Test 2 (path gate)** is hermetic and Docker-free: it asserts a real,
  existing path outside the root (`/tmp`) is rejected with the boundary error.
  A *nonexistent* path would fail earlier in `realpath()` with `ENOENT` and the
  assertion would be meaningless — that was the old test's portability bug
  (`/home/cory/agent-foundry` exists only on the VPS).

## Verification

- Local (no Docker): test 2 passes, test 1 reports a skip; `tsc --build` green.
- CI (Docker present): the full suite runs unskipped; P8 is the change expected
  to take the sandbox suite from red (every historical run) to green.
