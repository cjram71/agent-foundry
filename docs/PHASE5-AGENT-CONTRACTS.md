# Phase 5 Agent Contracts

The files in `config/agents` and `config/tools` are the reviewed source of truth for candidate agent versions and tool risk. They do not grant operating-system access by themselves. Runtime enforcement is added only after persistence, API, budget, and evaluation gates pass.

Rules:

- GREEN tools are read-only and may be automatically allowed.
- YELLOW tools have bounded side effects and require policy checks.
- RED tools require a recorded human approval before dispatch.
- BLACK tools use the `never` executor and every agent must explicitly deny them.
- Every agent version has fixed model, filesystem, network, database, memory, budget, evaluation, and escalation scopes.
- Production activation must create a new version; manifests are never silently overwritten.

Validate with `npm run validate -w @foundry/agent-contracts` and test with `npm test -w @foundry/agent-contracts`.
