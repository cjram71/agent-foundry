export interface GizmoTraceContext {
  traceId: string;
  missionId?: string;
  taskId?: string;
  attemptId?: string;
  agentRunId?: string;
  correlationId?: string;
}

export interface GizmoMetricEvent extends GizmoTraceContext {
  name: string;
  value: number;
  unit?: string;
  attributes?: Record<string, string | number | boolean>;
}
