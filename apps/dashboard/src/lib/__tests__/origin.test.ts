import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../origin.ts';

const APP = 'https://foundry.internal.example';

test('origin: matching Origin header is accepted', () => {
  process.env.APP_URL = APP;
  const request = new Request(`${APP}/api/tasks`, { method: 'POST', headers: { origin: APP } });
  assert.equal(isSameOrigin(request), true);
});

test('origin: foreign Origin header is rejected', () => {
  process.env.APP_URL = APP;
  const request = new Request(`${APP}/api/tasks`, { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(isSameOrigin(request), false);
});

test('origin: missing Origin header is tolerated (same-origin fetch / curl)', () => {
  process.env.APP_URL = APP;
  const request = new Request(`${APP}/api/tasks`, { method: 'POST' });
  assert.equal(isSameOrigin(request), true);
});

test('origin: Origin differing only by path is still accepted (origin = scheme+host+port)', () => {
  process.env.APP_URL = APP;
  const request = new Request(`${APP}/api/auth/login`, { method: 'POST', headers: { origin: APP } });
  assert.equal(isSameOrigin(request), true);
});

test('origin: without APP_URL configured, the request origin is the baseline', () => {
  delete process.env.APP_URL;
  const ok = new Request('http://127.0.0.1:3000/api/x', { method: 'POST', headers: { origin: 'http://127.0.0.1:3000' } });
  assert.equal(isSameOrigin(ok), true);
  const bad = new Request('http://127.0.0.1:3000/api/x', { method: 'POST', headers: { origin: 'http://other.example' } });
  assert.equal(isSameOrigin(bad), false);
  process.env.APP_URL = APP;
});
