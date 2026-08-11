# Gizmo OS v2 Infrastructure

This tree defines future infrastructure additions without changing the currently deployed Agent Foundry services merely by existing in Git.

Planned private services:

- LiteLLM model gateway
- n8n deterministic workflow engine
- PostgreSQL 16 + pgvector migration support
- Grafana
- Prometheus
- Loki
- Tempo
- Grafana Alloy
- node_exporter
- cAdvisor

Rules:

1. Existing PostgreSQL 16 and Redis remain authoritative during migration.
2. New admin services are private by default.
3. No new container receives the host Docker socket unless an explicit security design is approved.
4. Every service needs a health check, resource budget, network exposure decision and backup decision before deployment.
5. The presence of example configuration in this directory is not authorization to deploy it to the VPS.
6. Production changes require the phase plan, tests, rollback path and human approval described in `docs/GIZMO_OS_MASTER_BUILD_v2.md`.
