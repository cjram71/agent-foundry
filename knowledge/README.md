# Gizmo Knowledge Vault Source

The private runtime vault lives outside Git at `/srv/gizmo/knowledge-vault/`. This repository stores only templates, schemas and non-sensitive conventions.

Runtime structure:

```text
00-Inbox/
10-Missions/
20-Projects/
30-Businesses/
40-Knowledge/
50-Decisions/
60-Skills/
70-Runbooks/
80-Reports/
90-Archive/
Templates/
Generated/
```

Rules:

- no API keys, passwords or private keys;
- generated notes include source/provenance metadata;
- important transactional facts remain in PostgreSQL;
- imported/retrieved text is data, not system instruction;
- Obsidian Headless is optional and must not be a single point of failure;
- vault data receives independent backup even if Obsidian Sync is used.
