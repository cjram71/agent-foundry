-- P6 slice 2: project policy engine storage.
--
-- Additive migration: the versioned ProjectPolicy table (one ACTIVE version
-- per project, enforced at the application layer inside the same
-- transaction that activates a new version). Single-active is intentionally
-- NOT a partial unique index: Prisma's schema cannot express one, and a
-- hand-added index would show up as permanent drift in `migrate diff`.
--
-- Backfill: every pre-existing project gets a v1 ACTIVE row whose values
-- reproduce pre-P6 behavior exactly (ceiling 'high', both approval gates
-- mandatory), attributed to the migration. No existing row is altered.

-- CreateTable
CREATE TABLE "ProjectPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "maxTaskRisk" TEXT NOT NULL DEFAULT 'high',
    "requirePlanApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireMergeApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPolicy_projectId_version_key" ON "ProjectPolicy"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectPolicy_projectId_active_idx" ON "ProjectPolicy"("projectId", "active");

-- AddForeignKey
ALTER TABLE "ProjectPolicy" ADD CONSTRAINT "ProjectPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One-time backfill: v1 ACTIVE policy per existing project (behavior-preserving defaults).
INSERT INTO "ProjectPolicy" ("id", "projectId", "version", "active", "createdBy")
SELECT gen_random_uuid()::text, "id", 1, true, 'system-migration'
FROM "Project";
