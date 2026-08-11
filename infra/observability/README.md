# Gizmo observability target

Planned private observability stack:

- OpenTelemetry instrumentation
- Grafana Alloy collector
- Tempo traces
- Prometheus metrics
- Loki logs
- Grafana dashboards
- node_exporter
- cAdvisor

Trace correlation should follow Mission -> Task -> TaskAttempt -> AgentRun -> model/tool call -> sandbox -> GitHub PR -> approval.

The existing PostgreSQL task/audit history remains authoritative; telemetry supplements it and must not contain secrets or unrestricted prompt payloads.
