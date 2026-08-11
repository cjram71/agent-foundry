# Memory runtime

The Memory runtime provides deterministic hybrid retrieval over lexical and pgvector semantic evidence. It enforces tenant and project scope, minimum trust, expiry, and provenance before returning evidence. PostgreSQL queries parameterize all caller-controlled values.

Production certification on 2026-08-11 used the immutable `pgvector/pgvector:0.8.2-pg16-bookworm` image digest recorded in `docker-compose.yml`. A restored-copy rehearsal applied all pending migrations before the approved live cutover. The live database retained `agent-foundry_postgres_data`, applied all 11 Prisma migrations, loaded pgvector 0.8.2, created the generated search vector plus GIN and HNSW indexes, and passed SQL connectivity checks.

Rollback and recovery procedures are documented in `PGVECTOR_CUTOVER.md`. The verified pre-cutover backup is `/srv/agent-foundry/backups/20260811T223922Z`.

