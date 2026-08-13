# Boosta OS foundation

Boosta OS is the first company operating configuration built on the Agent Foundry execution kernel. Agent Foundry remains responsible for deterministic missions, tasks, attempts, policy, cost controls, isolated execution, verification, and audit evidence. Boosta OS adds the company context that explains why work exists and which human authority governs it.

## First company

The migration seeds the owner-confirmed baseline for **Boosta Förlag AB** (`BSTA-COMP-001`, organization number `559157-0873`). It includes the registered publishing, editorial, media, agency, consulting, and education capabilities supplied during onboarding.

The seed intentionally does not claim knowledge of current products, ISBNs, rights, contracts, customers, channels, or operational finances. Those remain unknown until a source-backed company-discovery mission verifies them.

## Governance defaults

The seeded constitution is a **draft**. It cannot authorize autonomous operations. Its initial human-only decisions include:

- constitution changes;
- legal commitments and contract signatures;
- rights acquisition and licensing;
- public product releases;
- bank and payment changes;
- external spending until an explicit limit is approved.

The AI workforce may research, analyze, recommend, and prepare internal work. Existing Agent Foundry approval and execution controls remain authoritative.

## Dashboard design

The primary interface is organized for a non-technical company owner:

1. **Home** answers what needs attention, what is happening, and what should happen next.
2. **Decisions** contains human approval work.
3. **Company** shows verified facts, capabilities, missing information, and governance limits.
4. **Projects, missions, tasks, and evidence** explain approved work in progressively more detail.
5. Technical model, queue, health, and audit views remain available under **Advanced**.

## Deployment

After merging and pulling on the VPS:

```bash
# Node.js 24 LTS is required by the current dashboard tooling.
npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run build
```

Follow the repository's normal safe-update process before restarting services. The migration is additive: existing projects and missions remain valid with a nullable `companyId`.

## Next vertical slice

The next implementation should create `BOOSTA-COMPANY-DISCOVERY-001`, a read-only mission that inventories products, editions, ISBNs, rights, contributors, contracts, channels, customers, financial systems, data, technology, and missing evidence. Findings should enter the company fact ledger as proposed claims, never as silent permanent truth.
