CREATE TABLE "CompanyDepartment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "executiveRole" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "authorityLevel" TEXT NOT NULL DEFAULT 'ADVISORY',
  "budgetLimitMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyAgent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "managerId" TEXT,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "responsibilities" TEXT[],
  "capabilities" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "tools" TEXT[],
  "dataAccess" JSONB NOT NULL,
  "financialLimitMinor" BIGINT NOT NULL DEFAULT 0,
  "externalActionLimit" JSONB NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0.0',
  "status" TEXT NOT NULL DEFAULT 'STAGING',
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyAgent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyDepartment_companyId_code_key" ON "CompanyDepartment"("companyId", "code");
CREATE INDEX "CompanyDepartment_companyId_status_idx" ON "CompanyDepartment"("companyId", "status");
CREATE INDEX "CompanyAgent_companyId_status_idx" ON "CompanyAgent"("companyId", "status");
CREATE INDEX "CompanyAgent_departmentId_status_idx" ON "CompanyAgent"("departmentId", "status");
CREATE INDEX "CompanyAgent_managerId_idx" ON "CompanyAgent"("managerId");
ALTER TABLE "CompanyDepartment" ADD CONSTRAINT "CompanyDepartment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyAgent" ADD CONSTRAINT "CompanyAgent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyAgent" ADD CONSTRAINT "CompanyAgent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "CompanyDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyAgent" ADD CONSTRAINT "CompanyAgent_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "CompanyAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "CompanyDepartment" ("id","companyId","code","name","purpose","executiveRole","authorityLevel","updatedAt") VALUES
('BSTA-DEPT-EXEC','BSTA-COMP-001','EXECUTIVE','Executive Office','Company direction, synthesis, escalation and owner briefing.','AI CEO','AI_CEO',CURRENT_TIMESTAMP),
('BSTA-DEPT-STR','BSTA-COMP-001','STRATEGY','Strategy','Strategic planning, scenarios, portfolio and strategic risk.','Chief Strategy Officer','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-INT','BSTA-COMP-001','INTELLIGENCE','Corporate Intelligence','Market, competitor, technology, regulatory and IP intelligence.','Chief Intelligence Officer','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-OPP','BSTA-COMP-001','OPPORTUNITY','Opportunity & Innovation','Opportunity discovery, validation, scoring, experiments and independent challenge.','Chief Innovation Officer','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-PROD','BSTA-COMP-001','PRODUCT','Product','Product research, requirements, experience, roadmap and quality.','AI CPO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-PRD','BSTA-COMP-001','PRODUCTION','Production','Approved project planning, building, testing, release and documentation.','AI COO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-TECH','BSTA-COMP-001','TECHNOLOGY','Technology','Architecture, development, infrastructure, reliability and AI/ML.','AI CTO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-MKT','BSTA-COMP-001','MARKETING','Marketing','Research, brand, content, acquisition and conversion analysis.','AI CMO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-SALES','BSTA-COMP-001','SALES','Sales','Lead, pricing, proposals, forecasting and partnerships.','AI CRO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-CS','BSTA-COMP-001','CUSTOMER_SUCCESS','Customer Success','Onboarding, support, feedback, retention and complaints.','Customer Success Executive','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-FIN','BSTA-COMP-001','FINANCE','Finance','Accounting support, cash flow, budgets, forecasts, risk and AI FinOps.','AI CFO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-IP','BSTA-COMP-001','IP_PUBLISHING','IP & Publishing','Editorial, rights, licensing, metadata and content repurposing.','Publishing Executive','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-LEGAL','BSTA-COMP-001','LEGAL_COMPLIANCE','Legal & Compliance','Legal research, privacy, GDPR, EU AI Act and evidence.','AI Compliance Officer','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-SEC','BSTA-COMP-001','SECURITY_RISK','Security & Risk','Identity, zero trust, threats, incidents, application and data security.','AI CISO','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-SVC','BSTA-COMP-001','SERVICE_OPERATIONS','Service Operations','Incidents, changes, releases, availability, continuity and reporting.','AI Service Operations Officer','DEPARTMENT',CURRENT_TIMESTAMP),
('BSTA-DEPT-AI','BSTA-COMP-001','AI_WORKFORCE','AI Workforce','Agent identity, permissions, evaluation, cost, audit and retirement.','AI Governance Officer','DEPARTMENT',CURRENT_TIMESTAMP);

INSERT INTO "CompanyAgent" ("id","companyId","departmentId","managerId","name","role","purpose","responsibilities","capabilities","permissions","tools","dataAccess","externalActionLimit","riskLevel","model","createdBy","updatedAt") VALUES
('BSTA-EXEC-001','BSTA-COMP-001','BSTA-DEPT-EXEC',NULL,'Boosta AI CEO','AI CEO','Evaluate company state and opportunities, coordinate executive recommendations, and present bounded decisions to the human owner.',ARRAY['understand approved strategy','evaluate opportunities and projects','coordinate executives','challenge assumptions','monitor company health','escalate material decisions','maintain executive decision history'],'{"recommend":true,"coordinate":true,"approveLegal":false,"executeExternal":false}','{"authority":"ADVISORY","humanOverride":true,"selfElevation":false}',ARRAY[]::TEXT[],'{"read":["company","constitution","missions","projects","approved-memory","audit-summary"],"write":["recommendations","approval-requests","memory-candidates"]}','{"spending":false,"contracts":false,"publishing":false,"communications":false,"deployment":false}','HIGH','cloud:reasoning','phase-02-bootstrap',CURRENT_TIMESTAMP),
('BSTA-EXEC-002','BSTA-COMP-001','BSTA-DEPT-EXEC','BSTA-EXEC-001','Boosta AI COO / Chief of Staff','AI COO','Coordinate approved tasks, workflows, dependencies, schedules and executive reporting without gaining external authority.',ARRAY['orchestrate approved work','route tasks','track dependencies and deadlines','prepare executive reports','escalate blockers','coordinate department requests'],'{"recommend":true,"coordinate":true,"approveLegal":false,"executeExternal":false}','{"authority":"ORCHESTRATION_ONLY","humanOverride":true,"selfElevation":false}',ARRAY[]::TEXT[],'{"read":["company","missions","projects","tasks","agent-status","audit-summary"],"write":["task-routing","status-reports","approval-requests"]}','{"spending":false,"contracts":false,"publishing":false,"communications":false,"deployment":false}','HIGH','cloud:reasoning','phase-02-bootstrap',CURRENT_TIMESTAMP);

INSERT INTO "AuditEvent" ("id","actor","action","target","result","metadata") VALUES
(gen_random_uuid()::text,'phase-02-bootstrap','executive_layer.registry_created','BSTA-COMP-001','success','{"departments":16,"executives":2,"status":"STAGING","externalActions":false,"financialAuthorityMinor":0}');
