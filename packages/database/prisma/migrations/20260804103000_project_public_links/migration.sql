ALTER TABLE "Project"
  ADD COLUMN "projectType" TEXT NOT NULL DEFAULT 'web_app',
  ADD COLUMN "productionUrl" TEXT,
  ADD COLUMN "vercelTeamRef" TEXT;

UPDATE "Project"
SET "projectType" = 'web_app',
    "productionUrl" = 'https://around-town-stockholm.vercel.app',
    "vercelProjectRef" = 'prj_8zrGCgAyEGRy6rJ3wlL18OpEWliU',
    "vercelTeamRef" = 'team_A2x5DKmcZLBfC0LefCaZc7jT'
WHERE lower("githubOwner") = 'cjram71'
  AND lower("githubRepo") = 'around-town-stockholm';
