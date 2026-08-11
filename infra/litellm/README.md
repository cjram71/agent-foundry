# LiteLLM migration target

LiteLLM will become Gizmo's private provider-neutral model gateway after the current direct Gemini/Ollama behavior is wrapped behind `packages/models` and parity-tested.

Do not expose the gateway publicly. Exact model aliases, provider credentials and production deployment configuration must be added only during the Model Layer phase with rollback to the current direct-provider path.

Initial role aliases:

- planner-fast
- planner-strong
- coder-strong
- reviewer-independent
- researcher-fast
- embedding-default
- local-fallback
