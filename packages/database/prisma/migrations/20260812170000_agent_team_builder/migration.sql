CREATE TABLE "ProjectAgent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "agentVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'supervised',
  "supervisedRuns" INTEGER NOT NULL DEFAULT 0,
  "acceptedRuns" INTEGER NOT NULL DEFAULT 0,
  "requiredTestsPassed" BOOLEAN NOT NULL DEFAULT false,
  "securityReviewPassed" BOOLEAN NOT NULL DEFAULT false,
  "charterVersion" INTEGER,
  "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "scheduleExpression" TEXT,
  "certifiedBy" TEXT,
  "certifiedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAgent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentRunReport" (
  "id" TEXT NOT NULL,
  "projectAgentId" TEXT NOT NULL,
  "taskId" TEXT,
  "completed" TEXT[],
  "waitingForApproval" TEXT[],
  "uncertain" TEXT[],
  "evidence" TEXT[],
  "memoryCandidates" JSONB,
  "accepted" BOOLEAN,
  "reviewNotes" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRunReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectAgent_projectId_agentVersionId_key" ON "ProjectAgent"("projectId", "agentVersionId");
CREATE INDEX "ProjectAgent_projectId_status_idx" ON "ProjectAgent"("projectId", "status");
CREATE INDEX "ProjectAgent_agentVersionId_status_idx" ON "ProjectAgent"("agentVersionId", "status");
CREATE INDEX "AgentRunReport_projectAgentId_createdAt_idx" ON "AgentRunReport"("projectAgentId", "createdAt");
CREATE INDEX "AgentRunReport_taskId_idx" ON "AgentRunReport"("taskId");
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentRunReport" ADD CONSTRAINT "AgentRunReport_projectAgentId_fkey" FOREIGN KEY ("projectAgentId") REFERENCES "ProjectAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_status_check" CHECK ("status" IN ('supervised','certified','paused','retired'));
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_run_counts_check" CHECK ("supervisedRuns" >= 0 AND "acceptedRuns" >= 0 AND "acceptedRuns" <= "supervisedRuns");
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_schedule_gate_check" CHECK (NOT "scheduleEnabled" OR "status" = 'certified');
ALTER TABLE "AgentRunReport" ADD CONSTRAINT "AgentRunReport_time_check" CHECK ("completedAt" >= "startedAt");
