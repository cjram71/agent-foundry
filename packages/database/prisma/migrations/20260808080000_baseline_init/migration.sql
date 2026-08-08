-- Baseline migration (P3 data-integrity rescue).
--
-- This replaces the retired migrations `20260803074008_init` and
-- `20260804103000_project_public_links`, whose committed SQL did not match
-- schema.prisma (githubRepository vs githubRepo, errorInformation vs errorInfo,
-- extra NOT NULL updatedAt, TEXT role vs Role enum, RESTRICT vs CASCADE, and a
-- second migration that referenced a column the first never created -- so a
-- fresh `migrate deploy` could never succeed).
--
-- This SQL is written to reproduce EXACTLY the state defined by
-- packages/database/prisma/schema.prisma. Parity is enforced in CI by applying
-- this migration to a scratch PostgreSQL and asserting `prisma migrate diff`
-- between the migrated database and schema.prisma is empty.
--
-- Existing databases must NOT apply this migration blindly. Follow
-- docs/MIGRATION-RESCUE.md: back up, run scripts/reconcile-prisma-drift.sql,
-- then mark this migration as applied with `prisma migrate resolve`.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('draft', 'awaiting_plan_approval', 'approved', 'queued', 'planning', 'coding', 'testing', 'reviewing', 'awaiting_human_review', 'pull_request_open', 'preview_ready', 'approved_for_merge', 'rejected', 'failed', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "githubOwner" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "projectType" TEXT NOT NULL DEFAULT 'web_app',
    "productionUrl" TEXT,
    "vercelProjectRef" TEXT,
    "vercelTeamRef" TEXT,
    "authorisedStatus" BOOLEAN NOT NULL DEFAULT false,
    "spendingLimit" DOUBLE PRECISION NOT NULL DEFAULT 50.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completeInstruction" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'draft',
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "assignedAgent" TEXT,
    "branchName" TEXT,
    "pullRequestUrl" TEXT,
    "previewUrl" TEXT,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "outputSummary" TEXT,
    "errorInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "comments" TEXT,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
