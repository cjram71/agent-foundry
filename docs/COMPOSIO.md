# Composio MCP integration

The approved Composio workspace connection manager is exposed in the dashboard at `/composio`.

MCP endpoint:

```text
https://connect.composio.dev/mcp
```

This endpoint is configuration-only until an MCP client is implemented in the Agent Foundry Tool Gateway. Connecting an app in Composio does not grant an agent permission to invoke it.

Required implementation controls before activation:

- authenticated MCP session and secret isolation;
- explicit toolkit/action allow-list;
- agent, project, purpose, risk, and approval checks;
- input/output schema validation;
- rate limits, idempotency, timeout, and retry rules;
- redacted audit events with no credentials or payload secrets;
- emergency-stop enforcement;
- live verification with external actions disabled by default.

Do not place Composio API keys or connected-account tokens in Git, the knowledge vault, prompts, or checkpoint files.

