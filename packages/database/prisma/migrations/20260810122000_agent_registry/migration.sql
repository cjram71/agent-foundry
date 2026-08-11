-- Phase 5B: immutable, versioned production agent registry.
-- Additive-only: no existing tables or rows are modified.

CREATE TYPE "AgentLifecycleStatus" AS ENUM ('EXPERIMENTAL', 'STAGING', 'ACTIVE', 'RETIRED');

CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'gizmo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "AgentLifecycleStatus" NOT NULL DEFAULT 'EXPERIMENTAL',
    "manifest" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");
CREATE INDEX "AgentVersion_agentId_status_idx" ON "AgentVersion"("agentId", "status");
CREATE INDEX "AgentVersion_status_idx" ON "AgentVersion"("status");
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
