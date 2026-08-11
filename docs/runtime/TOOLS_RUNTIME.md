# Tool Gateway runtime

`@foundry/tools` executes registered capabilities rather than exposing credentials. Unknown tools, missing permissions, missing approvals, invalid schemas, and rate-limit violations fail closed before a handler runs. High-risk tools cannot be registered without approval. Non-idempotent tools cannot retry. Every decision and attempt is audited without input/output payloads or credential references.

Verification: `npm run test --workspace @foundry/tools && npm run build`.

Rollback: remove registrations from callers first, then revert the Tool Gateway commits. The package has no database migration or background service.
