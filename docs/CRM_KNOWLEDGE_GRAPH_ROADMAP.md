# CRM Department and Knowledge Graph Roadmap

## Delivered on 2026-08-20

The VPS-native CRM department is now part of the existing Agent Foundry deployment. It reuses the current dashboard, PostgreSQL database, authentication, audit log, and agent registry. No new application, API service, database, port, credential, or external connector was introduced.

### CRM capability

- Admin-protected `/crm` dashboard and `/api/crm` route.
- Durable CRM contacts, activities, and draft-only agent tasks in PostgreSQL.
- Contact records are confidential by default and every CRM operation is audited.
- Existing customer accounts remain the account-level source of truth.

### Department and agent guardrails

- `BSTA-DEPT-CRM` is an `ADVISORY` department with a zero budget.
- `BSTA-CRM-001` (CRM Research Analyst) and `BSTA-CRM-002` (CRM Follow-up Planner) are `STAGING` only.
- Both agents have zero financial authority and no web, email, calendar, or payment access.
- Both can read CRM-scoped records and create draft internal tasks only.
- Approving a CRM task changes its review state only; it does not invoke a runner or enable external action.

### Verification completed

- Prisma schema validation and client generation passed.
- Dashboard typecheck and production build passed.
- Additive migration `20260820160000_crm_department` applied successfully.
- Dashboard reloaded successfully; local health check confirmed PostgreSQL and Redis health.

## Planned for 2026-08-21: Provenance-first knowledge graph

Build the graph as an additive module in the existing PostgreSQL database. PostgreSQL is the durable source of truth; an in-memory graph library may be used only for bounded traversal inside a worker.

### Data model

1. `KnowledgeDocument`: approved source documents, content hashes, classification, and ingestion state.
2. `KnowledgeExtractionRun`: model, prompt version, schema version, limits, outcome, and audit metadata.
3. `KnowledgeEntity`: canonical typed nodes such as people, organizations, products, projects, and documents.
4. `KnowledgeAlias`: surface forms linked to canonical entities without silently dropping unmatched names.
5. `KnowledgeEdge`: typed subject-predicate-object assertions with validity and review state.
6. `KnowledgeEvidence`: source location, excerpt/hash, extraction time, and provenance for every assertion.
7. `KnowledgeProfile`: versioned summaries for high-degree entities, regenerated only when source evidence changes.

### Workflow

1. A human approves a document for ingestion.
2. A staged extraction agent produces structured entity and relationship proposals.
3. A staged resolution agent proposes canonical entities and aliases.
4. An evaluator checks each proposed claim against provenance and flags conflicts.
5. A human accepts or rejects graph promotions.
6. Query agents receive only a bounded, cited subgraph and must return supporting edge identifiers.

### Non-negotiable controls

- Graph writes begin as `PROPOSED`; model confidence never makes a fact trusted.
- Every edge has source, timestamp, extraction run, schema version, and provenance.
- Per-run document, entity, token, and cost limits are enforced.
- CRM, operations, and intelligence records use namespaces with explicit cross-namespace links.
- No external action, connector, browser, email, calendar, payment, or autonomous execution is enabled by the graph.
- A human review queue, random evidence sampling, alias-resolution fallback, and schema-version tracking are required before supervised ingestion is enabled.

### First acceptance milestone

Using a small, human-approved set of documents, the system can:

- extract proposed CRM-related facts;
- resolve aliases without losing unmatched entities;
- display provenance for every proposed edge;
- promote only human-reviewed facts; and
- answer one multi-document CRM question with exact supporting graph edges.
