import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRequest, isAuthPage, isAuthApi } from '../request-guard.ts';

const cases: Array<[string, boolean, ReturnType<typeof decideRequest>]> = [
  ['/', false, { action: 'redirect', location: '/login' }],
  ['/tasks', false, { action: 'redirect', location: '/login' }],
  ['/tasks/abc-123', false, { action: 'redirect', location: '/login' }],
  ['/approvals', false, { action: 'redirect', location: '/login' }],
  ['/runs', false, { action: 'redirect', location: '/login' }],
  ['/projects', false, { action: 'redirect', location: '/login' }],
  ['/api/tasks', false, { action: 'reject', status: 401 }],
  ['/api/projects', false, { action: 'reject', status: 401 }],
  ['/api/tasks/abc-123', false, { action: 'reject', status: 401 }],
  ['/login', false, { action: 'allow' }],
  ['/api/auth/login', false, { action: 'allow' }],
  ['/api/auth/logout', false, { action: 'allow' }],
  ['/', true, { action: 'allow' }],
  ['/tasks/abc-123', true, { action: 'allow' }],
  ['/api/tasks', true, { action: 'allow' }],
  ['/api/auth/login', true, { action: 'allow' }],
  ['/login', true, { action: 'allow' }],
];

test('request-guard: full decision matrix', () => {
  for (const [pathname, authenticated, expected] of cases) {
    assert.deepEqual(decideRequest(pathname, authenticated), expected, `decideRequest(${JSON.stringify(pathname)}, authenticated=${authenticated})`);
  }
});

test('authenticated-looking stale sessions can reach login for recovery', () => {
  assert.deepEqual(decideRequest('/login', true), { action: 'allow' });
});

test('request-guard: path classifiers', () => {
  assert.equal(isAuthPage('/login'), true);
  assert.equal(isAuthPage('/login/expired'), true);
  assert.equal(isAuthPage('/loginish'), true);
  assert.equal(isAuthPage('/tasks'), false);
  assert.equal(isAuthApi('/api/auth/login'), true);
  assert.equal(isAuthApi('/api/auth/logout'), true);
  assert.equal(isAuthApi('/api/tasks'), false);
  assert.equal(isAuthApi('/api/authenticate'), true);
});

test('health endpoint is public for external service monitoring', () => {
  assert.deepEqual(decideRequest('/api/health', false), { action: 'allow' });
});
