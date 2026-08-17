import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignMission, campaignSource, parseCampaignRequest } from '../boosta-campaign';

const input = { title: 'Autumn books', objective: 'Create awareness', audience: 'Swedish readers', offer: 'New releases', destinations: ['website', 'linkedin'], targetLanguages: ['sv', 'en'], constraints: ['Use verified titles only'] };

test('campaign intake is bounded and produces a governed mission', () => {
  const request = parseCampaignRequest(input);
  const mission = campaignMission(request, 'owner');
  assert.equal(mission.riskLevel, 'medium');
  assert.deepEqual(mission.approvalRules, ['campaign-draft']);
  assert.match(campaignSource(request), /## Audience/);
});

test('campaign intake rejects unsupported destinations', () => {
  assert.throws(() => parseCampaignRequest({ ...input, destinations: ['unknown-network'] }), /unsupported/);
});
