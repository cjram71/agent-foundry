// Startup environment validation for the dashboard. Fails closed: the service
// refuses to serve traffic when required configuration is missing or weak.
// Secret VALUES are never included in error output — only variable names and
// expectations. Pure so the whole matrix is unit-testable.

export type EnvProblemReport = { errors: string[]; warnings: string[] };

export function collectEnvProblems(env: NodeJS.ProcessEnv = process.env): EnvProblemReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';

  const jwt = env.JWT_SECRET;
  if (!jwt) errors.push('JWT_SECRET is required');
  else if (jwt.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
  else if (jwt.length < 48) warnings.push('JWT_SECRET is shorter than the recommended 48 characters');
  if (jwt && /replace_with/i.test(jwt)) errors.push('JWT_SECRET still contains a placeholder value');

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) errors.push('DATABASE_URL is required');
  else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) errors.push('DATABASE_URL must be a postgres:// connection string');
  else if (/replace_with/i.test(databaseUrl)) errors.push('DATABASE_URL still contains a placeholder value');

  if (env.APP_URL) {
    try { new URL(env.APP_URL); } catch { errors.push('APP_URL must be a complete URL when set'); }
  } else if (production) {
    warnings.push('APP_URL is not set; same-origin checks fall back to the request origin');
  }

  if (production && !env.REDIS_PASSWORD) errors.push('REDIS_PASSWORD is required in production (task queue authentication)');

  return { errors, warnings };
}

export class EnvConfigurationError extends Error {
  readonly report: EnvProblemReport;

  constructor(report: EnvProblemReport) {
    super(
      'Agent Foundry dashboard configuration is invalid (see names only; values are never displayed):\n'
      + report.errors.map((e) => `  - ${e}`).join('\n'),
    );
    this.name = 'EnvConfigurationError';
    this.report = report;
  }
}

let validated = false;

export function assertEnvValid(): void {
  if (validated) return;
  const report = collectEnvProblems();
  for (const warning of report.warnings) console.warn(`[config] ${warning}`);
  if (report.errors.length) throw new EnvConfigurationError(report);
  validated = true;
}
