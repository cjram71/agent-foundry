# Role Catalog (P9)

The agent catalog is the **role whitelist** the planner chooses from. It is a git
clone of `cjram71/500-AI-Agents-Projects` at `AGENT_CATALOG_PATH`, consumed
read-only by the orchestrator (`apps/orchestrator/src/catalog.ts`). Catalog text
lands inside the planner prompt, so it is simultaneously *trusted for admission*
(only listed roles are selectable) and *untrusted as content* (never executed,
always treated as data).

## Trust model

Two layers, both deterministic — no model judgment involved:

1. **Integrity: the checkout is a real, verifiable commit.**
   `verifyCatalogCommit()` runs `git -C <root> rev-parse --verify HEAD^{commit}`.
   Unlike the pre-P9 loader (which read `.git/HEAD` and raw ref files directly),
   this fails unless the named object **exists in the object database and is a
   commit** — a fabricated ref file with a plausible-looking 40-hex string is
   rejected (regression-tested).

2. **Authorization: the commit is the operator's pin.**
   `AGENT_CATALOG_COMMIT` pins the reviewed commit. `resolveCatalogPin()`
   compares case-insensitively and **fails closed** on any mismatch. An empty
   pin is *unpinned development mode*: the clone still must pass layer 1, but
   every plan produced records `catalogPinned: false` (transition metadata,
   `plan_generated` event payload, audit row, and the plan JSON's
   `catalogSource.pinned` visible in the dashboard). Production must set the
   pin — `scripts/install-ubuntu.sh` checks it out at provision time.

## Entry schema and content hygiene

Each `agents/NN-kebab-id/metadata.yaml` entry is parsed by
`parseCatalogEntry()`:

| Field | Rule |
| --- | --- |
| `id` (directory name) | must match `^\d{2}-[a-z0-9-]+$`; anything else (files like `README.md`) is ignored |
| `title`, `description`, `framework` | required, non-empty after sanitation; capped at 160 / 600 / 80 chars |
| `industry`, `difficulty` | optional; capped at 80 / 40 chars |
| `tags` | bracketed or bare comma list; ≤ 12 tags, each ≤ 48 chars |

- **Invisible-content stripping:** Unicode control and format characters
  (zero-width spaces, bidi overrides, C0/C1 controls) are removed from every
  field, so prompt-bound text cannot hide instructions from whoever reviewed
  the yaml.
- **Missing `metadata.yaml`** (incomplete clone/checkout): the entry is
  excluded from selection and recorded in `skippedEntries` (count lands in
  audit metadata).
- **Structured-but-invalid content** (missing required field, bad id):
  `CatalogIntegrityError` — fail closed. A parseable-but-wrong catalog is a
  tamper signal, not a soft error.
- Missing/empty catalog, unreadable directory: fail closed.

## Deterministic selection constraints (`plan.ts`)

`validatePlan()` owns admission of planner output; the model only proposes.
Rejected plans are never repaired — the planner regenerates on the next queue
attempt.

- **Membership & uniqueness:** every `catalogId` ∈ the verified catalog; no
  duplicates; 1–5 agents per plan (15 for manager-evaluation tasks).
- **Quality gate (new in P9):** the selected team's responsibilities must
  include a code review responsibility (`/review/i`) and a testing
  responsibility (`/test/i`), enforcing what the prompt already demanded.
- **Shape/size bounds** on every field: summary 10–2000 chars; 1–20 steps with
  numeric order; files ≤ 30 × 200 chars; risks ≤ 10 × 300; acceptance criteria
  1–12 × 300; agent name ≤ 120; reason 10–600; responsibilities 1–10 × 240.
  (The prompt asks for 1–12 steps; the validator bounds at 20 — the validator
  is the authoritative contract and is intentionally a lax superset of the
  prompt to avoid pointless rejection-and-retry cycles.)
- **Provenance is stamped server-side:** `catalogSource: { repository, commit,
  pinned }` comes from the loader, not the model; planner-supplied provenance
  is overwritten (tested).

## Failure semantics

`CatalogIntegrityError` = permanent. The worker converts it to BullMQ's
`UnrecoverableError`: no retries, one `task_failed` event with
`stage: "catalog_verification"`, task transitions `PLANNING → FAILED`, and the
failure audit row carries `permanentCatalogError: true` plus
`catalogCommit`/`catalogPinned` when known. Pre-P9, a catalog that failed to
load wedged tasks in PLANNING through the retry budget; that hole is closed.

## Operator runbook

- **Provision:** `scripts/install-ubuntu.sh` clones the catalog into
  `AGENT_CATALOG_PATH` (refusing to overwrite a non-catalog directory) and
  checks out `--detach $AGENT_CATALOG_COMMIT` when set.
- **Advance the pin:**
  ```bash
  git -C "$AGENT_CATALOG_PATH" fetch origin
  git -C "$AGENT_CATALOG_PATH" log --oneline HEAD..origin/main   # review!
  git -C "$AGENT_CATALOG_PATH" diff HEAD..origin/main -- agents/ # review!
  # set AGENT_CATALOG_COMMIT=<new sha> in .env, then:
  git -C "$AGENT_CATALOG_PATH" checkout --detach <new sha>
  pm2 restart foundry-orchestrator
  ```
  Known-good at time of writing: `9beeb721c2af551bacaab827a76bddaecaa0ca5e`
  (2026-07-27, 21 agents) — verified to parse cleanly through the P9 loader.
- **Emergency rollback:** checkout the previous known-good sha; the pin check
  makes any other state a hard failure rather than silent role drift.

## Verification

- 16 unit/integration tests (`npm test --workspace=apps/orchestrator`):
  schema parsing, field bounds, invisible-character stripping, pin
  match/mismatch/malformed, fabricated-ref rejection, skipped-entry recording,
  empty-catalog failure, selection constraints, review/testing gate,
  provenance stamping.
- Real-production catalog (`/tmp` clone at `9beeb72`, 21 agents) loads
  cleanly in pinned and unpinned mode; a wrong pin is rejected.
- `tsc --build` green at root.
