-- reconcile-prisma-drift.sql
--
-- Idempotent, data-preserving reconciliation for an EXISTING Agent Foundry
-- database whose physical structure drifted from schema.prisma (or was built
-- by the retired migrations). Safe to run more than once. Run inside a backup
-- window only -- see docs/MIGRATION-RESCUE.md. Never drops user data; one
-- legacy column (AgentRun.updatedAt) is retained but relaxed so the Prisma
-- client can insert.
--
-- Verified in CI: applied twice in a row against a freshly migrated scratch
-- database (idempotency smoke test).

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Project"') IS NULL OR to_regclass('public."Task"') IS NULL THEN
    RAISE EXCEPTION 'Agent Foundry tables not found. This script is only for an existing database; fresh installs should use prisma migrate deploy.';
  END IF;
END $$;

-- 1. Project.githubRepository -> githubRepo (retired migration 1 used the old name)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name='githubRepository')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name='githubRepo') THEN
    ALTER TABLE "Project" RENAME COLUMN "githubRepository" TO "githubRepo";
  END IF;
END $$;

-- 2. Project columns added by retired migration 2 (no-op on databases that already have them)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectType" TEXT NOT NULL DEFAULT 'web_app';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "productionUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "vercelTeamRef" TEXT;

-- 3. AgentRun.errorInformation -> errorInfo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='errorInformation')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='errorInfo') THEN
    ALTER TABLE "AgentRun" RENAME COLUMN "errorInformation" TO "errorInfo";
  END IF;
END $$;

-- 4. AgentRun.updatedAt existed only in retired migration 1 with NOT NULL and no
--    default, which would make every Prisma client insert fail. Keep the data,
--    relax the constraint. The Prisma schema intentionally does not map it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='updatedAt') THEN
    ALTER TABLE "AgentRun" ALTER COLUMN "updatedAt" DROP NOT NULL;
    ALTER TABLE "AgentRun" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- 5. AgentRun.promptHash is required in the current schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='promptHash' AND is_nullable='YES') THEN
    UPDATE "AgentRun" SET "promptHash" = 'legacy-unavailable' WHERE "promptHash" IS NULL;
    ALTER TABLE "AgentRun" ALTER COLUMN "promptHash" SET NOT NULL;
  END IF;
END $$;

-- 6. User.role: retired migration 1 created TEXT DEFAULT 'ADMIN'; schema.prisma
--    uses a Role enum with DEFAULT 'OPERATOR'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');
  END IF;
END $$;

DO $$
DECLARE role_type text;
BEGIN
  SELECT data_type INTO role_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='User' AND column_name='role';
  IF role_type = 'text' THEN
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OPERATOR';

-- 7. Task.riskLevel: retired migration defaulted 'low'; schema.prisma defaults 'medium'
ALTER TABLE "Task" ALTER COLUMN "riskLevel" SET DEFAULT 'medium';

-- 8. Approval.decision: ensure the current default exists on older structures
ALTER TABLE "Approval" ALTER COLUMN "decision" SET DEFAULT 'pending';

-- 9. Retired migration 1 declared foreign keys ON DELETE RESTRICT, which breaks
--    the dashboard project-deletion flow and contradicts schema.prisma
--    (onDelete: Cascade). Recreate them with the schema semantics. The
--    drop-and-add is idempotent because the names and definitions are fixed.
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_projectId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun" DROP CONSTRAINT IF EXISTS "AgentRun_taskId_fkey";
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Approval" DROP CONSTRAINT IF EXISTS "Approval_taskId_fkey";
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. OPTIONAL operator step, intentionally left commented out. The retired
--     second migration backfilled these values for one project. Re-apply only
--     if the operator confirms the row is missing them; prefer the dashboard
--     "Edit public link" action or a deliberate UPDATE instead.
-- UPDATE "Project"
-- SET "projectType" = 'web_app',
--     "productionUrl" = 'https://around-town-stockholm.vercel.app',
--     "vercelProjectRef" = 'prj_8zrGCgAyEGRy6rJ3wlL18OpEWliU',
--     "vercelTeamRef" = 'team_A2x5DKmcZLBfC0LefCaZc7jT'
-- WHERE lower("githubOwner") = 'cjram71'
--   AND lower("githubRepo") = 'around-town-stockholm';

COMMIT;
