-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "lifecycleStage" TEXT NOT NULL DEFAULT 'IDEA',
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "priceMinor" BIGINT,
    "launchApprovedBy" TEXT,
    "launchApprovedAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductQualityGate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT[],
    "checkedBy" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductQualityGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRights" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ownership" TEXT NOT NULL,
    "authors" TEXT[],
    "version" TEXT NOT NULL,
    "formats" TEXT[],
    "territories" TEXT[],
    "licensingTerms" TEXT,
    "royaltyTerms" TEXT,
    "copyrightNotice" TEXT NOT NULL,
    "evidence" TEXT[],
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBudgetMinor" BIGINT NOT NULL DEFAULT 0,
    "spentMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "expectedOutcome" TEXT NOT NULL,
    "actualOutcome" TEXT,
    "roiBasisPoints" INTEGER,
    "lessons" TEXT[],
    "budgetApprovedBy" TEXT,
    "budgetApprovedAt" TIMESTAMP(3),
    "publicationApprovedBy" TEXT,
    "publicationApprovedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "offer" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL,
    "valueMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "forecastCloseAt" TIMESTAMP(3),
    "partnership" BOOLEAN NOT NULL DEFAULT false,
    "upsell" TEXT,
    "crossSell" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "owner" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "dataClassification" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
    "healthScore" INTEGER,
    "churnRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "retentionPlan" TEXT,
    "owner" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "caseType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "resolution" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "owner" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT,
    "productId" TEXT,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT[],
    "routes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_companyId_lifecycleStage_idx" ON "Product"("companyId", "lifecycleStage");

-- CreateIndex
CREATE INDEX "Product_projectId_lifecycleStage_idx" ON "Product"("projectId", "lifecycleStage");

-- CreateIndex
CREATE INDEX "ProductQualityGate_productId_status_idx" ON "ProductQualityGate"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductQualityGate_productId_gate_key" ON "ProductQualityGate"("productId", "gate");

-- CreateIndex
CREATE INDEX "ProductRights_productId_createdAt_idx" ON "ProductRights"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_companyId_status_idx" ON "MarketingCampaign"("companyId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_productId_status_idx" ON "MarketingCampaign"("productId", "status");

-- CreateIndex
CREATE INDEX "SalesOpportunity_companyId_stage_idx" ON "SalesOpportunity"("companyId", "stage");

-- CreateIndex
CREATE INDEX "SalesOpportunity_forecastCloseAt_idx" ON "SalesOpportunity"("forecastCloseAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_externalReference_key" ON "CustomerAccount"("externalReference");

-- CreateIndex
CREATE INDEX "CustomerAccount_companyId_status_idx" ON "CustomerAccount"("companyId", "status");

-- CreateIndex
CREATE INDEX "CustomerAccount_companyId_churnRisk_idx" ON "CustomerAccount"("companyId", "churnRisk");

-- CreateIndex
CREATE INDEX "CustomerCase_companyId_status_idx" ON "CustomerCase"("companyId", "status");

-- CreateIndex
CREATE INDEX "CustomerCase_accountId_status_idx" ON "CustomerCase"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFeedback_idempotencyKey_key" ON "BusinessFeedback"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BusinessFeedback_companyId_status_idx" ON "BusinessFeedback"("companyId", "status");

-- CreateIndex
CREATE INDEX "BusinessFeedback_productId_status_idx" ON "BusinessFeedback"("productId", "status");

-- CreateIndex
CREATE INDEX "BusinessFeedback_accountId_status_idx" ON "BusinessFeedback"("accountId", "status");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQualityGate" ADD CONSTRAINT "ProductQualityGate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRights" ADD CONSTRAINT "ProductRights_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFeedback" ADD CONSTRAINT "BusinessFeedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFeedback" ADD CONSTRAINT "BusinessFeedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFeedback" ADD CONSTRAINT "BusinessFeedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
