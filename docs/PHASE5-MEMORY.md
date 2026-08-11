# Phase 5D memory architecture

GIZMO memory is opt-in, scoped, attributable, and expiring. PostgreSQL is the source of truth. Qdrant stores only embeddings and references to approved PostgreSQL records. Artifacts are represented by checksum-bearing metadata and must live beneath the configured artifact root.

- Working memory: one-day task state.
- Conversation and semantic memory: require explicit persistence approval.
- Structured memory: bounded JSON with provenance.
- Artifact memory: relative paths only, with size and SHA-256 checksum.
- Operational memory: summaries, never credentials or raw secret-bearing logs.

Payloads are limited to 64 KiB, retention is capped at 365 days, and secret-like content is rejected. Agent permissions remain governed by the agent registry.
