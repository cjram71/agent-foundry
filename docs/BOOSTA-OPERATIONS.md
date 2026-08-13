# Boosta OS operations

## Daily operation

1. Open **Content pipeline** in the Boosta dashboard.
2. Put a Markdown assignment in `/srv/boosta/work/inbox/`.
3. Within 15 seconds the autonomy service moves it to `work/processing/`, creates a durable job, and generates Swedish and English drafts.
4. Review the draft in the dashboard or `work/review/`.
5. Select **Approve draft** or **Regenerate**. Approval creates a package in `work/publish-ready/`; it does not publish externally.
6. After manually publishing, select **Confirm published**.

## Failure recovery

- Failed jobs remain visible. Fix the file, credential, or model problem and select **Retry job**.
- Ingest, draft, approval, preparation, failure, retry, and completion are recorded in `AuditEvent`.
- Never edit database state manually to skip an approval.

## Storage contract

`BOOSTA_WORKSPACE_ROOT` is the only canonical root. Mount the NAS there when available. Until then, the VPS directory is authoritative and must be backed up.

## Publication adapters

External publishing is intentionally disabled. Add one destination at a time only after its credentials, idempotency, rollback, and owner approval gate are tested.
