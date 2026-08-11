export type Availability = 'available' | 'partial' | 'unknown' | 'unavailable' | 'not_configured';
export type SystemStatus = 'operational' | 'degraded' | 'attention_required' | 'maintenance' | 'emergency_stop' | 'unknown';
export type ServiceStatus = 'operational' | 'degraded' | 'stopped' | 'unavailable' | 'unknown' | 'not_configured';
export type AgentRuntimeState = 'idle' | 'working' | 'waiting' | 'reviewing' | 'blocked' | 'approval_required' | 'failed' | 'unknown';
export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DataValue<T> { value: T | null; availability: Availability; reason?: string; observedAt: string }
export interface DashboardCounts { activeMissions:number; activeTasks:number; waitingTasks:number; blockedTasks:number; failedTasks:number; pendingApprovals:number; redApprovals:number }
export interface CostSnapshot { spendTodayUsd:number; spendMonthUsd:number; tokensToday:number; rateConfigured:boolean; dailyBudgetUsd:number|null; dailyBudgetSource:'agent_registry'|'not_configured' }
export interface MissionSummary { id:string; goal:string; project:string|null; businessId:string|null; status:string; phase:string; progress:{completed:number;total:number}; activeTask:{id:string;title:string;state:string}|null; assignedAgent:string|null; elapsedSeconds:number; budgetUsd:number; spendUsd:number; tokens:number; risk:string; nextAction:string; approvalState:string }
export interface AgentSummary { id:string; name:string; registryStatus:string; runtimeState:AgentRuntimeState; currentMission:{id:string;goal:string}|null; currentTask:{id:string;title:string}|null; agentRunId:string|null; elapsedSeconds:number|null; model:string|null; attempt:number|null; costUsd:number|null; tokens:number|null; lastActivity:string|null }
export interface AttentionItem { id:string; severity:AttentionSeverity; title:string; reason:string; ageSeconds:number; ownerAction:string; href:string; missionId?:string; projectId?:string; taskId?:string }
export interface ActivityItem { id:string; timestamp:string; type:string; actor:string; actorType:string; title:string; missionId?:string; taskId?:string; attemptId?:string; correlationId?:string }
export interface QueueSnapshot { name:'plan'|'execution'; waiting:number;active:number;delayed:number;failed:number;oldestWaitingSeconds:number|null;wedgeDetected:boolean }
export interface ServiceSnapshot { id:string; label:string; status:ServiceStatus; detail?:string; observedAt:string; cpuPercent?:number|null; memoryBytes?:number|null }
export interface HostSnapshot { cpuPercent:number|null; memoryUsedBytes:number|null; memoryTotalBytes:number|null; diskUsedBytes:number|null; diskTotalBytes:number|null; load1:number|null; load5:number|null; load15:number|null }
export interface TodayDashboardData { generatedAt:string; status:SystemStatus; counts:DataValue<DashboardCounts>; cost:DataValue<CostSnapshot>; missions:DataValue<MissionSummary[]>; agents:DataValue<AgentSummary[]>; attention:DataValue<AttentionItem[]>; activity:DataValue<ActivityItem[]>; queues:DataValue<QueueSnapshot[]>; services:DataValue<ServiceSnapshot[]>; host:DataValue<HostSnapshot>; emergencyStop:DataValue<boolean> }
