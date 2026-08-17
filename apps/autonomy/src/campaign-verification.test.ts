import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignVerificationPayload, parseCampaignVerification } from './editorial';

test('campaign verification requires a mission and emits bounded metadata', () => {
  const payload = campaignVerificationPayload({ id: 'job-1', missionId: 'mission-1', title: 'Campaign', destinations: ['website'], targetLanguages: ['sv'] }, 'abc123');
  assert.deepEqual(payload, { missionId: 'mission-1', editorialJobId: 'job-1', title: 'Campaign', destinations: ['website'], targetLanguages: ['sv'], draftChecksum: 'abc123' });
  assert.throws(() => campaignVerificationPayload({ ...payload, id: 'job-1', missionId: null }, 'abc123'), /requires a Mission/);
});

test('campaign verification fails closed on malformed n8n evidence', () => {
  assert.deepEqual(parseCampaignVerification({ status: 'verified', workflow: 'boosta-campaign-verification', checkedAt: '2026-08-14T00:00:00.000Z' }), { status: 'verified', workflow: 'boosta-campaign-verification', checkedAt: '2026-08-14T00:00:00.000Z' });
  assert.throws(() => parseCampaignVerification({ status: 'ok' }), /did not verify/);
  assert.throws(() => parseCampaignVerification({ status: 'verified', workflow: 'workflow', checkedAt: 'not-a-date' }), /invalid timestamp/);
});


test('campaign verification evidence must match the submitted package', () => {
  const checkedAt = new Date().toISOString(), expected = { missionId: 'mission-1', editorialJobId: 'job-1', draftChecksum: 'a'.repeat(64), requestedAt: Date.now() };
  assert.equal(parseCampaignVerification({ status: 'verified', workflow: 'workflow', checkedAt, missionId: 'mission-1', editorialJobId: 'job-1', draftChecksum: 'a'.repeat(64) }, expected).checkedAt, checkedAt);
  assert.throws(() => parseCampaignVerification({ status: 'verified', workflow: 'workflow', checkedAt, missionId: 'wrong', editorialJobId: 'job-1', draftChecksum: 'a'.repeat(64) }, expected), /mismatched missionId/);
});
