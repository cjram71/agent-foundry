-- CreateTable
CREATE TABLE "FinanceLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "category" TEXT NOT NULL,
    "department" TEXT,
    "agentId" TEXT,
    "model" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "customerId" TEXT,
    "productId" TEXT,
    "providerInvoiceRef" TEXT,
    "providerUsageRef" TEXT,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
    "evidence" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfoReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "forecast" JSONB NOT NULL,
    "risks" TEXT[],
    "generatedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfoReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[],
    "owner" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "title" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containedAt" TIMESTAMP(3),
    "investigatedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "escalationAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "lessons" TEXT[],
    "evidence" TEXT[],
    "owner" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "obligation" TEXT NOT NULL,
    "readinessStatus" TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
    "legalInformation" TEXT NOT NULL,
    "professionalAdviceNeeded" BOOLEAN NOT NULL DEFAULT false,
    "professionalEscalation" TEXT,
    "owner" TEXT NOT NULL,
    "evidence" TEXT[],
    "dueAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "customers" TEXT[],
    "dataClassification" TEXT NOT NULL,
    "dependencies" TEXT[],
    "suppliers" TEXT[],
    "sla" JSONB NOT NULL,
    "recovery" JSONB NOT NULL,
    "availabilityTarget" DOUBLE PRECISION,
    "capacity" JSONB,
    "monitoring" JSONB NOT NULL,
    "continuityPlan" TEXT NOT NULL,
    "lastReviewAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT[],
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLedgerEntry_idempotencyKey_key" ON "FinanceLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinanceLedgerEntry_companyId_occurredAt_idx" ON "FinanceLedgerEntry"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceLedgerEntry_projectId_occurredAt_idx" ON "FinanceLedgerEntry"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceLedgerEntry_agentId_model_occurredAt_idx" ON "FinanceLedgerEntry"("agentId", "model", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceLedgerEntry_reconciliationStatus_occurredAt_idx" ON "FinanceLedgerEntry"("reconciliationStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "CfoReport_companyId_periodEnd_idx" ON "CfoReport"("companyId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CfoReport_companyId_period_periodStart_periodEnd_key" ON "CfoReport"("companyId", "period", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SecurityFinding_companyId_severity_status_idx" ON "SecurityFinding"("companyId", "severity", "status");

-- CreateIndex
CREATE INDEX "OperationalIncident_companyId_severity_status_idx" ON "OperationalIncident"("companyId", "severity", "status");

-- CreateIndex
CREATE INDEX "ComplianceIssue_companyId_framework_readinessStatus_idx" ON "ComplianceIssue"("companyId", "framework", "readinessStatus");

-- CreateIndex
CREATE INDEX "ServiceRecord_companyId_status_nextReviewAt_idx" ON "ServiceRecord"("companyId", "status", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_companyId_name_key" ON "ServiceRecord"("companyId", "name");

-- CreateIndex
CREATE INDEX "ServiceEvent_serviceId_eventType_occurredAt_idx" ON "ServiceEvent"("serviceId", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CfoReport" ADD CONSTRAINT "CfoReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityFinding" ADD CONSTRAINT "SecurityFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceIssue" ADD CONSTRAINT "ComplianceIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
