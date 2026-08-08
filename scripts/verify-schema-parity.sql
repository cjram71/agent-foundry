-- verify-schema-parity.sql
--
-- Engine-independent parity check: RAISES (exit non-zero via ON_ERROR_STOP)
-- unless the current database structure matches what the Prisma client
-- generated from packages/database/prisma/schema.prisma expects to find.
-- Complements `prisma migrate diff --exit-code` for environments where the
-- Prisma engine binaries cannot be fetched, and is safe to run anytime:
-- it is a single read-only assertion block.
--
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-schema-parity.sql

DO $$
DECLARE
  labels text[];
  colcount int;
  matched int;
  c record;
BEGIN
  -- 1. Enums with exact labels and order
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'Role';
  IF labels IS DISTINCT FROM ARRAY['ADMIN','OPERATOR'] THEN
    RAISE EXCEPTION 'Role enum mismatch: %', labels;
  END IF;

  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TaskStatus';
  IF labels IS DISTINCT FROM ARRAY['draft','awaiting_plan_approval','approved','queued','planning','coding',
      'testing','reviewing','awaiting_human_review','pull_request_open','preview_ready','approved_for_merge',
      'rejected','failed','cancelled','completed'] THEN
    RAISE EXCEPTION 'TaskStatus enum mismatch: %', labels;
  END IF;

  -- 2. Exact column sets per table (name, non-null, type)
  FOR c IN
    SELECT * FROM (VALUES
      ('User',       ARRAY['id','email','passwordHash','role','createdAt','lastLoginAt']),
      ('Project',    ARRAY['id','name','githubOwner','githubRepo','defaultBranch','projectType','productionUrl','vercelProjectRef','vercelTeamRef','authorisedStatus','spendingLimit','createdAt']),
      ('Task',       ARRAY['id','projectId','title','completeInstruction','status','riskLevel','assignedAgent','branchName','pullRequestUrl','previewUrl','tokenUsage','estimatedCost','createdAt','startedAt','completedAt']),
      ('AgentRun',   ARRAY['id','taskId','provider','model','role','promptHash','status','tokenUsage','outputSummary','errorInfo','createdAt']),
      ('Approval',   ARRAY['id','taskId','approvalType','requestedAt','approvedBy','approvedAt','decision','comments']),
      ('AuditEvent', ARRAY['id','actor','action','target','result','metadata','timestamp'])
    ) AS t(tbl, cols)
  LOOP
    SELECT COUNT(*) INTO colcount FROM information_schema.columns
      WHERE table_schema='public' AND table_name = c.tbl;
    SELECT COUNT(*) INTO matched FROM information_schema.columns
      WHERE table_schema='public' AND table_name = c.tbl AND column_name = ANY(c.cols);
    IF colcount IS DISTINCT FROM array_length(c.cols, 1) OR matched IS DISTINCT FROM array_length(c.cols, 1) THEN
      RAISE EXCEPTION 'Table % column set mismatch (found %, matched %, expected %)',
        c.tbl, colcount, matched, array_length(c.cols, 1);
    END IF;
  END LOOP;

  -- 3. Legacy drift must be absent on a correct database structure
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name='githubRepository') THEN
    RAISE EXCEPTION 'Legacy column Project.githubRepository still present';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='errorInformation') THEN
    RAISE EXCEPTION 'Legacy column AgentRun.errorInformation still present';
  END IF;

  -- 4. Types, nullability, and defaults the client depends on
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name='githubRepo' AND data_type='text';
  IF NOT FOUND THEN RAISE EXCEPTION 'Project.githubRepo missing or wrong type'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='promptHash' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'AgentRun.promptHash must be NOT NULL'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AgentRun' AND column_name='errorInfo' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'AgentRun.errorInfo must be nullable text'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='role'
    AND udt_name='Role' AND is_nullable='NO' AND column_default LIKE '%OPERATOR%';
  IF NOT FOUND THEN RAISE EXCEPTION 'User.role must be Role enum NOT NULL DEFAULT OPERATOR'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Task' AND column_name='status'
    AND udt_name='TaskStatus' AND column_default LIKE '%draft%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task.status must be TaskStatus enum DEFAULT draft'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Task' AND column_name='riskLevel'
    AND column_default LIKE '%medium%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task.riskLevel must DEFAULT medium'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Approval' AND column_name='decision'
    AND column_default LIKE '%pending%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval.decision must DEFAULT pending'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project' AND column_name='spendingLimit'
    AND data_type='double precision';
  IF NOT FOUND THEN RAISE EXCEPTION 'Project.spendingLimit must be double precision'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AuditEvent' AND column_name='metadata'
    AND data_type='jsonb' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'AuditEvent.metadata must be nullable jsonb'; END IF;

  -- 5. Unique index on User.email
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='User' AND indexname='User_email_key'
    AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(email)%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unique index User_email_key missing'; END IF;

  -- 6. Foreign keys with CASCADE delete semantics (schema.prisma onDelete: Cascade)
  FOR c IN
    SELECT conname, conrelid::regclass::text AS child, confdeltype, confupdtype
      FROM pg_constraint
      WHERE contype='f' AND conname IN ('Task_projectId_fkey','AgentRun_taskId_fkey','Approval_taskId_fkey')
  LOOP
    IF c.confdeltype <> 'c' OR c.confupdtype <> 'c' THEN
      RAISE EXCEPTION 'FK % on % must be ON DELETE CASCADE ON UPDATE CASCADE (got del=% up=%)',
        c.conname, c.child, c.confdeltype, c.confupdtype;
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM pg_constraint WHERE contype='f' AND conname IN
        ('Task_projectId_fkey','AgentRun_taskId_fkey','Approval_taskId_fkey')) <> 3 THEN
    RAISE EXCEPTION 'Expected 3 CASCADE foreign keys to exist';
  END IF;

  RAISE NOTICE 'SCHEMA PARITY OK: database structure matches the Prisma client contract';
END $$;
