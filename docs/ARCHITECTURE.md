# Architecture

```text
Administrator
    |
    v
Next.js Dashboard (authentication, projects, tasks, approvals)
    |
    +--> PostgreSQL / Prisma (durable state and audit events)
    |
    +--> Redis / BullMQ
             |
             +--> Orchestrator (plans and specialist-agent selection)
             |
             +--> Runner (workspace, code generation, validation, review)
                        |
                        +--> GitHub CLI (branch, push, draft PR)
                        +--> restricted Docker validation sandbox

AI routing: Gemini primary -> private Ollama fallback for transient/quota failures
```

## Trust boundaries

Repository content, project instructions, model responses, and the external agent catalog are treated as untrusted. Projects must be explicitly authorized. Plans require human approval. Changed paths and task branches are validated. Validation containers have no network and reduced privileges. Pull requests are drafts and automatic merging is disabled.

## Runtime data

PostgreSQL and Redis use Docker volumes. Managed repositories live under `FOUNDRY_REPO_ROOT`. Agent catalog data lives under `AGENT_CATALOG_PATH`. These paths, model data, PM2 state, and secrets are excluded from Git.
