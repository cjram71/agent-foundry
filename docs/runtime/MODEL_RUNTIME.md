# Model runtime

`@foundry/models` provides the provider-neutral `ModelClient` contract, an OpenAI-compatible private LiteLLM adapter, usage/cost/latency accounting, and transient-only rollback composition.

The orchestrator planner is the first canary integration. Existing direct Gemini/Ollama behavior remains the default.

## Canary configuration

- `LITELLM_PLANNER_ENABLED=true` enables the planner canary.
- `LITELLM_URL` defaults to `http://127.0.0.1:4000`.
- `LITELLM_MASTER_KEY` is mandatory when the canary is enabled.
- `LITELLM_PLANNER_MODEL` selects the reviewed LiteLLM alias.
- `LITELLM_DIRECT_ROLLBACK=true` permits fallback to the prior direct route only for classified transient failures.

Canary success and failure/rollback decisions are written to `AuditEvent`. Error messages are classified without recording credentials or prompt content.

## Verification

```bash
npm run test --workspace @foundry/models
npm run test --workspace orchestrator
npm run build
```

## Rollback

Set `LITELLM_PLANNER_ENABLED=false` (or remove it) and restart only the orchestrator through the normal deployment procedure. The unchanged direct Gemini/Ollama route resumes. Revert the Model commits to remove the abstraction after confirming the direct route is healthy. No schema rollback is required.
