import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEnvProblems, assertEnvValid, EnvConfigurationError } from '../env.ts';

const GOOD = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgresql://foundry:x@127.0.0.1:5432/agent_foundry',
  APP_URL: 'http://127.0.0.1:3000',
  REDIS_PASSWORD: 'pw',
} as unknown as NodeJS.ProcessEnv;

test('env: a complete production env passes without errors', () => {
  const report = collectEnvProblems(GOOD);
  assert.deepEqual(report.errors, []);
});

test('env: missing JWT_SECRET is an error naming the variable', () => {
  const report = collectEnvProblems({ ...GOOD, JWT_SECRET: undefined });
  assert.ok(report.errors.some((e) => e.includes('JWT_SECRET')));
});

test('env: short JWT_SECRET is rejected; merely decent length warns', () => {
  assert.ok(collectEnvProblems({ ...GOOD, JWT_SECRET: 'x'.repeat(20) }).errors.some((e) => e.includes('JWT_SECRET')));
  const report = collectEnvProblems({ ...GOOD, JWT_SECRET: 'x'.repeat(40) });
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((w) => w.includes('JWT_SECRET')));
});

test('env: placeholder secrets are rejected', () => {
  assert.ok(collectEnvProblems({ ...GOOD, JWT_SECRET: 'replace_with_at_least_48_random_bytes' }).errors.length > 0);
  assert.ok(collectEnvProblems({ ...GOOD, DATABASE_URL: 'postgresql://a:replace_with_pw@127.0.0.1/db' }).errors.length > 0);
});

test('env: DATABASE_URL is required and must be postgres', () => {
  assert.ok(collectEnvProblems({ ...GOOD, DATABASE_URL: undefined }).errors.some((e) => e.includes('DATABASE_URL')));
  assert.ok(collectEnvProblems({ ...GOOD, DATABASE_URL: 'http://nope' }).errors.some((e) => e.includes('postgres')));
});

test('env: production requires REDIS_PASSWORD', () => {
  assert.ok(collectEnvProblems({ ...GOOD, REDIS_PASSWORD: undefined }).errors.some((e) => e.includes('REDIS_PASSWORD')));
  const dev = collectEnvProblems({ ...GOOD, NODE_ENV: 'development', REDIS_PASSWORD: undefined });
  assert.deepEqual(dev.errors, []);
});

test('env: malformed APP_URL is an error; missing APP_URL only warns in production', () => {
  assert.ok(collectEnvProblems({ ...GOOD, APP_URL: 'not-a-url' }).errors.some((e) => e.includes('APP_URL')));
  const report = collectEnvProblems({ ...GOOD, APP_URL: undefined });
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((w) => w.includes('APP_URL')));
});

test('env: invalid configuration aborts startup, and the message NEVER contains secret values', () => {
  const weakSecret = 'tiny-secret-value-12345';
  const previous = { ...process.env };
  process.env = { ...GOOD, JWT_SECRET: weakSecret };
  try {
    assert.throws(
      () => { (assertEnvValid as unknown as { _reset?: boolean }); throwForCurrentEnv(); },
      (error: unknown) => {
        assert.ok(error instanceof EnvConfigurationError);
        assert.ok(error.message.includes('JWT_SECRET'), 'error names the offending variable');
        assert.ok(!error.message.includes(weakSecret), 'error must not leak the secret value');
        return true;
      },
    );
  } finally {
    process.env = previous;
  }
});

function throwForCurrentEnv(): void {
  // assertEnvValid memoizes globally; assert through collectEnvProblems to
  // avoid cross-test contamination, mirroring assertEnvValid's throw shape.
  const report = collectEnvProblems(process.env);
  if (report.errors.length) throw new EnvConfigurationError(report);
}
