CREATE TABLE "WorldEntity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorldEntity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorldRelation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldRelation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TwinScenario" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baselineAt" TIMESTAMP(3),
    "horizonDays" INTEGER NOT NULL DEFAULT 90,
    "assumptions" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TwinScenario_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TwinScenarioChange" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "entityId" TEXT,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "patch" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinScenarioChange_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TwinScenarioResult" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "uncertainty" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "missingData" TEXT[],
    "executionBlocked" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinScenarioResult_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "dimensions" JSONB NOT NULL,
    "missingData" TEXT[],
    "evidenceRefs" TEXT[],
    "calculationVersion" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttentionItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "valueScore" DOUBLE PRECISION NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL,
    "estimatedReviewMinutes" INTEGER NOT NULL,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceRefs" TEXT[],
    "dueAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttentionItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorldEntity_companyId_canonicalKey_key" ON "WorldEntity"("companyId","canonicalKey");
CREATE UNIQUE INDEX "WorldRelation_companyId_fromEntityId_toEntityId_relationType_key" ON "WorldRelation"("companyId","fromEntityId","toEntityId","relationType");
CREATE UNIQUE INDEX "TwinScenarioResult_scenarioId_key" ON "TwinScenarioResult"("scenarioId");
CREATE INDEX "WorldEntity_companyId_entityType_validationStatus_idx" ON "WorldEntity"("companyId","entityType","validationStatus");
CREATE INDEX "WorldEntity_companyId_classification_idx" ON "WorldEntity"("companyId","classification");
CREATE INDEX "WorldRelation_companyId_relationType_idx" ON "WorldRelation"("companyId","relationType");
CREATE INDEX "TwinScenario_companyId_status_createdAt_idx" ON "TwinScenario"("companyId","status","createdAt");
CREATE INDEX "TwinScenarioChange_scenarioId_createdAt_idx" ON "TwinScenarioChange"("scenarioId","createdAt");
CREATE INDEX "TwinScenarioChange_entityId_idx" ON "TwinScenarioChange"("entityId");
CREATE INDEX "TwinScenarioResult_recordedAt_idx" ON "TwinScenarioResult"("recordedAt");
CREATE INDEX "HealthSnapshot_companyId_asOf_idx" ON "HealthSnapshot"("companyId","asOf");
CREATE INDEX "AttentionItem_companyId_status_priorityScore_idx" ON "AttentionItem"("companyId","status","priorityScore");
ALTER TABLE "WorldEntity" ADD CONSTRAINT "WorldEntity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorldRelation" ADD CONSTRAINT "WorldRelation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorldRelation" ADD CONSTRAINT "WorldRelation_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "WorldEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldRelation" ADD CONSTRAINT "WorldRelation_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "WorldEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TwinScenario" ADD CONSTRAINT "TwinScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwinScenarioChange" ADD CONSTRAINT "TwinScenarioChange_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "TwinScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwinScenarioChange" ADD CONSTRAINT "TwinScenarioChange_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "WorldEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TwinScenarioResult" ADD CONSTRAINT "TwinScenarioResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "TwinScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttentionItem" ADD CONSTRAINT "AttentionItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
