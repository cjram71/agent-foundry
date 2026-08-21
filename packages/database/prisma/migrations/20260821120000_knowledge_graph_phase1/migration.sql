-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUri" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "ingestionStatus" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeExtractionRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "tokenLimit" INTEGER,
    "costLimitMinor" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outcome" JSONB,
    "proposedEntityCount" INTEGER NOT NULL DEFAULT 0,
    "proposedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "surfaceForm" TEXT NOT NULL,
    "entityId" TEXT,
    "extractionRunId" TEXT,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEvidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "entityId" TEXT,
    "relationId" TEXT,
    "excerpt" TEXT NOT NULL,
    "excerptHash" TEXT NOT NULL,
    "sourceLocation" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeDocument_companyId_namespace_ingestionStatus_idx" ON "KnowledgeDocument"("companyId", "namespace", "ingestionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_companyId_contentHash_key" ON "KnowledgeDocument"("companyId", "contentHash");

-- CreateIndex
CREATE INDEX "KnowledgeExtractionRun_companyId_documentId_createdAt_idx" ON "KnowledgeExtractionRun"("companyId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeExtractionRun_companyId_status_idx" ON "KnowledgeExtractionRun"("companyId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeAlias_companyId_resolutionStatus_idx" ON "KnowledgeAlias"("companyId", "resolutionStatus");

-- CreateIndex
CREATE INDEX "KnowledgeAlias_entityId_idx" ON "KnowledgeAlias"("entityId");

-- CreateIndex
CREATE INDEX "KnowledgeEvidence_companyId_entityId_idx" ON "KnowledgeEvidence"("companyId", "entityId");

-- CreateIndex
CREATE INDEX "KnowledgeEvidence_companyId_relationId_idx" ON "KnowledgeEvidence"("companyId", "relationId");

-- CreateIndex
CREATE INDEX "KnowledgeEvidence_companyId_reviewStatus_idx" ON "KnowledgeEvidence"("companyId", "reviewStatus");

-- CreateIndex
CREATE INDEX "KnowledgeEvidence_extractionRunId_idx" ON "KnowledgeEvidence"("extractionRunId");

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeExtractionRun" ADD CONSTRAINT "KnowledgeExtractionRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeExtractionRun" ADD CONSTRAINT "KnowledgeExtractionRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAlias" ADD CONSTRAINT "KnowledgeAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAlias" ADD CONSTRAINT "KnowledgeAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "WorldEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAlias" ADD CONSTRAINT "KnowledgeAlias_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "KnowledgeExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "KnowledgeExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "WorldEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "WorldRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: an evidence row cites exactly one assertion (an entity or a relation), never both/neither
ALTER TABLE "KnowledgeEvidence" ADD CONSTRAINT "KnowledgeEvidence_exactly_one_target_check" CHECK (
    ("entityId" IS NOT NULL AND "relationId" IS NULL) OR ("entityId" IS NULL AND "relationId" IS NOT NULL)
);
