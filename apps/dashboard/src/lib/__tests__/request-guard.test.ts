import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRequest, isAuthPage, isAuthApi } from '../request-guard.ts';

const cases: Array<[string, boolean, ReturnType<typeof decideRequest>]> = [
  // Unauthenticated page access is bounced to /login
  ['/', false, { action: 'redirect', location: '/login' }],
  ['/tasks', false, { action: 'redirect', location: '/login' }],
  ['/tasks/abc-123', false, { action: 'redirect', location: '/login' }],
  ['/approvals', false, { action: 'redirect', location: '/login' }],
  ['/runs', false, { action: 'redirect', location: '/login' }],
  ['/projects', false, { action: 'redirect', location: '/login' }],
  // Unauthenticated API access gets a JSON 401 (no HTML redirect into fetch)
  ['/api/tasks', false, { action: 'reject', status: 401 }],
  ['/api/projects', false, { action: 'reject', status: 401 }],
  ['/api/tasks/abc-123', false, { action: 'reject', status: 401 }],
  // The login page and auth APIs stay reachable unauthenticated
  ['/login', false, { action: 'allow' }],
  ['/api/auth/login', false, { action: 'allow' }],
  ['/api/auth/logout', false, { action: 'allow' }],
  // Authenticated users pass everywhere, and bounce off /login
  ['/', true, { action: 'allow' }],
  ['/tasks/abc-123', true, { action: 'allow' }],
  ['/api/tasks', true, { action: 'allow' }],
  ['/api/auth/login', true, { action: 'allow' }],
  ['/login', true, { action: 'redirect', location: '/' }],
];

test('request-guard: full decision matrix', () => {
  for (const [pathname, authenticated, expected] of cases) {
    assert.deepEqual(
      decideRequest(pathname, authenticated),
      expected,
      `decideRequest(${JSON.stringify(pathname)}, authenticated=${authenticated})`,
    );
  }
});

test('request-guard: path classifiers', () => {
  assert.equal(isAuthPage('/login'), true);
  assert.equal(isAuthPage('/login/expired'), true);
  assert.equal(isAuthPage('/loginish'), true, 'prefix match is acceptable: /loginish does not exist but /login* is inert');
  assert.equal(isAuthPage('/tasks'), false);
  assert.equal(isAuthApi('/api/auth/login'), true);
  assert.equal(isAuthApi('/api/auth/logout'), true);
  assert.equal(isAuthApi('/api/tasks'), false);
  assert.equal(isAuthApi('/api/authenticate'), true, 'prefix match keeps any future auth namespace route reachable');
});
