import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmergencyStopEngaged, createStopSupervisor, deferJobWhileStopped, isWedged, parseWedgeTimeoutMinutes, EMERGENCY_STOP_KEY } from './index';

function store(value: string | null) {
  return { get: async (key: string) => (key === EMERGENCY_STOP_KEY ? value : null) };
}

test('stop flag: any set value engages, unset clears', async () => {
  assert.equal(await isEmergencyStopEngaged(store('1')), true);
  assert.equal(await isEmergencyStopEngaged(store('{"by":"cory"}')), true);
  assert.equal(await isEmergencyStopEngaged(store(null)), false);
});

test('supervisor pauses on engagement, resumes on clear, and is idempotent', async () => {
  let value: string | null = null;
  const redis = { get: async () => value };
  const calls: string[] = [];
  const worker = { pause: () => { calls.push('pause'); }, resume: () => { calls.push('resume'); } };
  const supervisor = createStopSupervisor({ store: redis, worker });

  assert.deepEqual(calls, []);
  assert.equal(await supervisor.tick(), false);
  assert.deepEqual(calls, ['resume'], 'initial state applied once');

  value = '1';
  assert.equal(await supervisor.tick(), true);
  assert.deepEqual(calls, ['resume', 'pause']);
  assert.equal(await supervisor.tick(), true);
  assert.deepEqual(calls, ['resume', 'pause'], 'no repeated pause while engaged');

  value = null;
  assert.equal(await supervisor.tick(), false);
  assert.deepEqual(calls, ['resume', 'pause', 'resume']);
});

test('supervisor keeps posture across a redis hiccup', async () => {
  const calls: string[] = [];
  let fail = false;
  const redis = { get: async () => { if (fail) throw new Error('redis down'); return '1'; } };
  const worker = { pause: () => { calls.push('pause'); }, resume: () => { calls.push('resume'); } };
  const supervisor = createStopSupervisor({ store: redis, worker });
  await supervisor.tick();
  fail = true;
  assert.equal(await supervisor.tick(), true, 'previous applied posture retained');
  assert.deepEqual(calls, ['pause']);
});

test('deferJobWhileStopped re-parks the job only while engaged', async () => {
  const delayed: number[] = [];
  const job = { id: 'job-1', token: 'tok', moveToDelayed: async (ts: number) => { delayed.push(ts); } };
  assert.equal(await deferJobWhileStopped(store(null), job), false);
  assert.deepEqual(delayed, []);
  const before = Date.now();
  assert.equal(await deferJobWhileStopped(store('1'), job), true);
  assert.equal(delayed.length, 1);
  assert.ok(delayed[0] >= before + 30_000 && delayed[0] <= Date.now() + 30_500);
});

test('deferJobWhileStopped fails closed when the flag cannot be read', async () => {
  const delayed: number[] = [];
  const redis = { get: async () => { throw new Error('redis flap'); } };
  const job = { id: 'job-2', token: 'tok', moveToDelayed: async (ts: number) => { delayed.push(ts); } };
  assert.equal(await deferJobWhileStopped(redis, job), true, 'unverifiable flag -> defer, never execute on doubt');
  assert.equal(delayed.length, 1);
});

test('wedge math: silence past the timeout only', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  assert.equal(isWedged({ updatedAt: new Date('2026-08-08T11:14:59Z'), now, timeoutMs: 45 * 60_000 }), true);
  assert.equal(isWedged({ updatedAt: new Date('2026-08-08T11:15:01Z'), now, timeoutMs: 45 * 60_000 }), false);
  assert.equal(parseWedgeTimeoutMinutes(undefined), 45);
  assert.equal(parseWedgeTimeoutMinutes('90'), 90);
  assert.equal(parseWedgeTimeoutMinutes('1'), 5, 'floor');
  assert.equal(parseWedgeTimeoutMinutes('9999'), 360, 'ceiling');
  assert.equal(parseWedgeTimeoutMinutes('junk'), 45);
});
