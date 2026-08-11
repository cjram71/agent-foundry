# n8n Workflow Factory boundary

n8n is planned as Gizmo's deterministic workflow engine, not the Gizmo brain.

Production requirements before deployment:

- private editor/admin UI
- separate PostgreSQL database/user
- strong instance encryption key
- credentials excluded from Git
- restricted risky nodes
- no host Docker socket
- no unrestricted host filesystem
- explicit CPU/memory limits
- security audit
- backup/restore coverage
- Gizmo policy/approval around consequential workflow invocation

Workflow definitions should be exported/versioned without credentials and represented by Gizmo Workflow Contracts.
