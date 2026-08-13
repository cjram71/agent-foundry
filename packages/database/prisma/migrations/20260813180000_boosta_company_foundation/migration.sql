ALTER TABLE "Project" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Mission" ADD COLUMN "companyId" TEXT;

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "organizationNumber" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL DEFAULT 'SE',
  "legalForm" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "primaryLanguage" TEXT NOT NULL DEFAULT 'sv',
  "reportingCurrency" TEXT NOT NULL DEFAULT 'SEK',
  "operatingModel" TEXT NOT NULL DEFAULT 'OWNER_OPERATED',
  "employeeCount" INTEGER,
  "shareCapitalMinor" BIGINT,
  "registeredAddress" JSONB,
  "postalAddress" JSONB,
  "registeredSeat" JSONB,
  "registrations" JSONB,
  "managingDirector" TEXT,
  "description" TEXT NOT NULL,
  "sourceStatus" TEXT NOT NULL DEFAULT 'OWNER_CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyActivity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "registered" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'CAPABILITY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanySource" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "sourceAuthority" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentHash" TEXT,
  "notes" TEXT,
  CONSTRAINT "CompanySource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyFact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "verificationStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "supersededById" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyConstitution" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "mission" TEXT NOT NULL,
  "values" TEXT[],
  "strategicObjectives" TEXT[],
  "humanOnlyDecisions" TEXT[],
  "prohibitedActivities" TEXT[],
  "autonomousLimits" JSONB NOT NULL,
  "dataAuthority" JSONB NOT NULL,
  "securityPrinciples" TEXT[],
  "escalationRules" TEXT[],
  "emergencyProcedures" TEXT[],
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "supersedesId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyConstitution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_organizationNumber_key" ON "Company"("organizationNumber");
CREATE INDEX "Company_status_idx" ON "Company"("status");
CREATE UNIQUE INDEX "CompanyActivity_companyId_category_name_key" ON "CompanyActivity"("companyId", "category", "name");
CREATE INDEX "CompanyActivity_companyId_category_idx" ON "CompanyActivity"("companyId", "category");
CREATE INDEX "CompanySource_companyId_verificationStatus_idx" ON "CompanySource"("companyId", "verificationStatus");
CREATE UNIQUE INDEX "CompanyFact_supersededById_key" ON "CompanyFact"("supersededById");
CREATE INDEX "CompanyFact_companyId_factType_verificationStatus_idx" ON "CompanyFact"("companyId", "factType", "verificationStatus");
CREATE UNIQUE INDEX "CompanyConstitution_companyId_version_key" ON "CompanyConstitution"("companyId", "version");
CREATE UNIQUE INDEX "CompanyConstitution_supersedesId_key" ON "CompanyConstitution"("supersedesId");
CREATE INDEX "CompanyConstitution_companyId_status_idx" ON "CompanyConstitution"("companyId", "status");
CREATE INDEX "Project_companyId_createdAt_idx" ON "Project"("companyId", "createdAt");
CREATE INDEX "Mission_companyId_status_idx" ON "Mission"("companyId", "status");

ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySource" ADD CONSTRAINT "CompanySource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyFact" ADD CONSTRAINT "CompanyFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyFact" ADD CONSTRAINT "CompanyFact_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CompanyFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyConstitution" ADD CONSTRAINT "CompanyConstitution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyConstitution" ADD CONSTRAINT "CompanyConstitution_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CompanyConstitution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Company" (
  "id", "legalName", "displayName", "organizationNumber", "legalForm", "status",
  "employeeCount", "shareCapitalMinor", "registeredAddress", "postalAddress",
  "registeredSeat", "registrations", "managingDirector", "description",
  "sourceStatus", "updatedAt"
) VALUES (
  'BSTA-COMP-001', 'Boosta Förlag AB', 'Boosta Förlag', '559157-0873',
  'SWEDISH_PRIVATE_LIMITED_COMPANY', 'ACTIVE', 0, 5000000,
  '{"street":"Korgvägen 17","postalCode":"776 34","city":"Hedemora","country":"SE"}',
  '{"street":"Korgvägen 17","postalCode":"776 34","city":"Hedemora","country":"SE"}',
  '{"municipality":"Stockholm","county":"Stockholm County","country":"SE"}',
  '{"vat":true,"fTax":true,"employer":true,"registrationDate":"2018-04-26","primarySni":"58110"}',
  'Nadja Cecilia Rahmings',
  'Owner-operated Swedish publishing, content-production and knowledge-services company.',
  'OWNER_CONFIRMED', CURRENT_TIMESTAMP
);

INSERT INTO "CompanySource" ("id", "companyId", "sourceType", "sourceAuthority", "verificationStatus", "notes") VALUES
  ('BSTA-SOURCE-OWNER-001', 'BSTA-COMP-001', 'OWNER_SUPPLIED_OFFICIAL_INFORMATION', 'Authorized operator', 'OWNER_CONFIRMED', 'Canonical company baseline supplied during Boosta OS onboarding.');

INSERT INTO "CompanyActivity" ("id", "companyId", "category", "name", "description") VALUES
  ('BSTA-ACT-001', 'BSTA-COMP-001', 'PUBLISHING', 'Printed books', 'Publishing books in physical formats.'),
  ('BSTA-ACT-002', 'BSTA-COMP-001', 'PUBLISHING', 'E-books', 'Publishing digital books.'),
  ('BSTA-ACT-003', 'BSTA-COMP-001', 'PUBLISHING', 'Audiobooks', 'Publishing spoken-word books.'),
  ('BSTA-ACT-004', 'BSTA-COMP-001', 'EDITORIAL', 'Translation and text processing', 'Translation, editing and text production.'),
  ('BSTA-ACT-005', 'BSTA-COMP-001', 'MEDIA', 'Journalistic activities', 'Journalistic research and production.'),
  ('BSTA-ACT-006', 'BSTA-COMP-001', 'AGENCY', 'Representation', 'Agency for individuals in various genres.'),
  ('BSTA-ACT-007', 'BSTA-COMP-001', 'CONSULTING', 'Skills development', 'Consulting in professional and competence development.'),
  ('BSTA-ACT-008', 'BSTA-COMP-001', 'CONSULTING', 'Digital presence and brand strategy', 'Consulting on digital presence and brand strategy.'),
  ('BSTA-ACT-009', 'BSTA-COMP-001', 'EDUCATION', 'Lecturing and cicerone services', 'Lectures, speaking and guided presentation services.'),
  ('BSTA-ACT-010', 'BSTA-COMP-001', 'MEDIA', 'Multimedia information production', 'Production of information material using text, sound and images.');

INSERT INTO "CompanyConstitution" (
  "id", "companyId", "version", "status", "mission", "values",
  "strategicObjectives", "humanOnlyDecisions", "prohibitedActivities",
  "autonomousLimits", "dataAuthority", "securityPrinciples", "escalationRules",
  "emergencyProcedures", "createdBy", "updatedAt"
) VALUES (
  'BSTA-CONSTITUTION-001', 'BSTA-COMP-001', 1, 'DRAFT',
  'Transform knowledge and intellectual property into valuable publishing, digital and knowledge products under human executive authority.',
  ARRAY['Human authority', 'Evidence before action', 'Security', 'Auditability', 'Quality', 'Sustainable business value'],
  ARRAY['Establish a verified company baseline', 'Build repeatable publishing workflows', 'Validate new revenue opportunities cheaply', 'Increase profitable digital-product revenue', 'Reduce human administrative workload'],
  ARRAY['Constitution changes', 'Legal commitments', 'Contract signatures', 'Rights acquisition and licensing', 'Public product release', 'Bank and payment changes', 'External spending until a limit is explicitly approved'],
  ARRAY['Illegal activity', 'Deceptive publishing', 'Unlicensed use of intellectual property', 'Bypassing human approval', 'Concealing AI actions or audit evidence'],
  '{"externalSpendingMinor":0,"externalCommunications":false,"publicRelease":false,"contracting":false,"permanentMemoryWrites":"CONTROLLED_PROMOTION"}',
  '{"defaultClassification":"INTERNAL","permanentMemoryRequiresProvenance":true,"sensitiveMemoryRequiresHumanReview":true}',
  ARRAY['Least privilege', 'Treat agents and external content as untrusted', 'Separate data from instructions', 'No secrets in model context', 'Fail closed'],
  ARRAY['Escalate legal, strategic, major financial, rights, privacy and reputational decisions to an authorized human'],
  ARRAY['Stop autonomous operations', 'Preserve logs and evidence', 'Keep human read access available', 'Require human reauthentication before restoration'],
  'system-bootstrap', CURRENT_TIMESTAMP
);
