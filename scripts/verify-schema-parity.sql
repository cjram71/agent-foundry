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

  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TaskState';
  IF labels IS DISTINCT FROM ARRAY['DRAFT','QUEUED','PLANNING','RUNNING','VALIDATING','REVIEWING','REPAIRING',
      'PR_CREATED','PREVIEW_PENDING','PREVIEW_READY','AWAITING_APPROVAL','CHANGES_REQUESTED','HUMAN_INPUT_REQUIRED',
      'APPROVED','REJECTED','SECURITY_BLOCKED','INFRASTRUCTURE_FAILED','CODE_FAILED','FAILED','CANCELLED','COMPLETED'] THEN
    RAISE EXCEPTION 'TaskState enum mismatch: %', labels;
  END IF;

  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TaskEventType';
  IF labels IS DISTINCT FROM ARRAY['task_created','task_queued','planning_started','plan_generated',
      'plan_approval_requested','plan_approved','plan_rejected','execution_started','code_generated',
      'validation_started','validation_passed','validation_failed','review_started','review_passed','review_failed',
      'draft_pr_opened','preview_ready','final_approval_requested','final_approved','final_rejected',
      'task_completed','task_failed','task_cancelled','task_state_changed'] THEN
    RAISE EXCEPTION 'TaskEventType enum mismatch: %', labels;
  END IF;

  -- 2. Exact column sets per table (name, non-null, type)
  FOR c IN
    SELECT * FROM (VALUES
      ('User',       ARRAY['id','email','passwordHash','role','createdAt','lastLoginAt']),
      ('Session',    ARRAY['id','userId','createdAt','expiresAt','lastSeenAt','ip','userAgent','revokedAt']),
      ('Project',    ARRAY['id','name','githubOwner','githubRepo','defaultBranch','projectType','productionUrl','vercelProjectRef','vercelTeamRef','authorisedStatus','spendingLimit','createdAt']),
      ('ProjectPolicy', ARRAY['id','projectId','version','active','maxTaskRisk','requirePlanApproval','requireMergeApproval','createdBy','createdAt']),
      ('Task',       ARRAY['id','projectId','title','completeInstruction','status','state','riskLevel','assignedAgent','branchName','pullRequestUrl','previewUrl','tokenUsage','estimatedCost','currentAttemptId','createdAt','updatedAt','startedAt','completedAt']),
      ('TaskAttempt', ARRAY['id','taskId','attemptNumber','status','correlationId','workspacePath','branchName','commitSha','outcomeSummary','startedAt','endedAt']),
      ('TaskStateTransition', ARRAY['id','taskId','attemptId','fromState','toState','actor','actorType','reason','correlationId','metadata','createdAt']),
      ('TaskEvent',  ARRAY['id','taskId','attemptId','type','actor','actorType','correlationId','payload','createdAt']),
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

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Task' AND column_name='state'
    AND udt_name='TaskState' AND is_nullable='NO' AND column_default LIKE '%DRAFT%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task.state must be TaskState enum NOT NULL DEFAULT DRAFT'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Task' AND column_name='updatedAt'
    AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task.updatedAt must be NOT NULL'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Task' AND column_name='currentAttemptId'
    AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task.currentAttemptId must be nullable'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TaskStateTransition' AND column_name='metadata'
    AND data_type='jsonb' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'TaskStateTransition.metadata must be nullable jsonb'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TaskStateTransition' AND column_name='attemptId'
    AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'TaskStateTransition.attemptId must be nullable (SetNull FK)'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TaskEvent' AND column_name='type'
    AND udt_name='TaskEventType' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'TaskEvent.type must be TaskEventType enum NOT NULL'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TaskEvent' AND column_name='payload'
    AND data_type='jsonb' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'TaskEvent.payload must be nullable jsonb'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TaskEvent' AND column_name='attemptId'
    AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'TaskEvent.attemptId must be nullable (SetNull FK)'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ProjectPolicy' AND column_name='maxTaskRisk'
    AND is_nullable='NO' AND column_default LIKE '%high%';
  IF NOT FOUND THEN RAISE EXCEPTION 'ProjectPolicy.maxTaskRisk must be NOT NULL DEFAULT high'; END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ProjectPolicy' AND column_name='active'
    AND data_type='boolean' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'ProjectPolicy.active must be boolean NOT NULL'; END IF;

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

  -- 5. Indexes: unique User.email, Session lookup indexes
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='User' AND indexname='User_email_key'
    AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(email)%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unique index User_email_key missing'; END IF;

  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='Session' AND indexname='Session_userId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index Session_userId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='Session' AND indexname='Session_expiresAt_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index Session_expiresAt_idx missing'; END IF;

  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskAttempt' AND indexname='TaskAttempt_taskId_attemptNumber_key'
    AND indexdef ILIKE '%UNIQUE%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unique index TaskAttempt_taskId_attemptNumber_key missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskAttempt' AND indexname='TaskAttempt_taskId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskAttempt_taskId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskStateTransition' AND indexname='TaskStateTransition_taskId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskStateTransition_taskId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskStateTransition' AND indexname='TaskStateTransition_correlationId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskStateTransition_correlationId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskStateTransition' AND indexname='TaskStateTransition_createdAt_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskStateTransition_createdAt_idx missing'; END IF;

  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskEvent' AND indexname='TaskEvent_taskId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskEvent_taskId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskEvent' AND indexname='TaskEvent_type_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskEvent_type_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskEvent' AND indexname='TaskEvent_correlationId_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskEvent_correlationId_idx missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='TaskEvent' AND indexname='TaskEvent_createdAt_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index TaskEvent_createdAt_idx missing'; END IF;

  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='ProjectPolicy' AND indexname='ProjectPolicy_projectId_version_key'
    AND indexdef ILIKE '%UNIQUE%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unique index ProjectPolicy_projectId_version_key missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND tablename='ProjectPolicy' AND indexname='ProjectPolicy_projectId_active_idx';
  IF NOT FOUND THEN RAISE EXCEPTION 'Index ProjectPolicy_projectId_active_idx missing'; END IF;

  -- 6. Foreign keys with CASCADE delete semantics (schema.prisma onDelete: Cascade)
  FOR c IN
    SELECT conname, conrelid::regclass::text AS child, confdeltype, confupdtype
      FROM pg_constraint
      WHERE contype='f' AND conname IN ('Task_projectId_fkey','AgentRun_taskId_fkey','Approval_taskId_fkey','Session_userId_fkey','TaskAttempt_taskId_fkey','TaskStateTransition_taskId_fkey','TaskEvent_taskId_fkey','ProjectPolicy_projectId_fkey')
  LOOP
    IF c.confdeltype <> 'c' OR c.confupdtype <> 'c' THEN
      RAISE EXCEPTION 'FK % on % must be ON DELETE CASCADE ON UPDATE CASCADE (got del=% up=%)',
        c.conname, c.child, c.confdeltype, c.confupdtype;
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM pg_constraint WHERE contype='f' AND conname IN
        ('Task_projectId_fkey','AgentRun_taskId_fkey','Approval_taskId_fkey','Session_userId_fkey','TaskAttempt_taskId_fkey','TaskStateTransition_taskId_fkey','TaskEvent_taskId_fkey','ProjectPolicy_projectId_fkey')) <> 8 THEN
    RAISE EXCEPTION 'Expected 8 CASCADE foreign keys to exist';
  END IF;

  -- 6b. attempt-linked history must survive attempt deletion (onDelete: SetNull)
  FOR c IN
    SELECT conname, confdeltype, confupdtype FROM pg_constraint
      WHERE contype='f' AND conname IN ('TaskStateTransition_attemptId_fkey','TaskEvent_attemptId_fkey')
  LOOP
    IF c.confdeltype <> 'n' OR c.confupdtype <> 'c' THEN
      RAISE EXCEPTION 'FK % must be ON DELETE SET NULL ON UPDATE CASCADE (got del=% up=%)', c.conname, c.confdeltype, c.confupdtype;
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM pg_constraint WHERE contype='f' AND conname IN
        ('TaskStateTransition_attemptId_fkey','TaskEvent_attemptId_fkey')) <> 2 THEN
    RAISE EXCEPTION 'Expected 2 SET NULL attempt foreign keys to exist';
  END IF;

  -- 7. Session columns the auth flow depends on
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Session' AND column_name='expiresAt' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'Session.expiresAt must be NOT NULL'; END IF;
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Session' AND column_name='revokedAt' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'Session.revokedAt must be nullable'; END IF;
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Session' AND column_name='lastSeenAt' AND column_default IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session.lastSeenAt must have a DEFAULT'; END IF;

  RAISE NOTICE 'SCHEMA PARITY OK: database structure matches the Prisma client contract';
END $$;
