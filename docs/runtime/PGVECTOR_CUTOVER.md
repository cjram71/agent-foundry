# pgvector Memory cutover

The production cutover is gated by a verified logical backup, a successful restored-copy checkpoint, explicit owner approval, the expected `postgres:16-alpine` source image, and the exact `agent-foundry_postgres_data` volume.

`scripts/gizmo-cutover-pgvector.sh` recreates only `foundry_postgres` on the same PostgreSQL 16 volume with the immutable pgvector image, runs the full pending Prisma chain, validates migration status and the HNSW index, then checks the Agent Foundry health endpoint.

Before migrations begin, any failure automatically recreates PostgreSQL with the old image. After migrations begin, do not downgrade the image because vector-backed schema objects exist. Keep the pgvector image, stop application deployment, and restore the verified logical backup into an isolated recovery database before any destructive decision.

The application-level Memory runtime can be disabled by removing its callers; existing Agent Foundry code ignores the additive tables and columns.
