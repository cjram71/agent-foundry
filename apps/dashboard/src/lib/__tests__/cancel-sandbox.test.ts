import test from 'node:test';
import assert from 'node:assert/strict';
import { sandboxSlugForTask, isTaskSandboxContainer, parseContainerNames } from '../cancel-sandbox';

test('slug mirrors the runner sandbox naming exactly', () => {
  assert.equal(sandboxSlugForTask('abc-123'), 'abc-123');
  assert.equal(sandboxSlugForTask('A task/with$odd  chars!'), 'A-task-with-odd--chars-');
  assert.equal(sandboxSlugForTask('x'.repeat(100)), 'x'.repeat(32), 'capped at 32');
  assert.equal(sandboxSlugForTask('!!!'), '---', 'everything hostile becomes dashes');
});

test('container match requires the exact slug plus a numeric suffix', () => {
  assert.equal(isTaskSandboxContainer('foundry-sandbox-task-7-1723100000000', 'task-7'), true);
  assert.equal(isTaskSandboxContainer('foundry-sandbox-task-7x991-1723100000000', 'task-7'), false, 'parallel task with a similar slug must not be killed');
  assert.equal(isTaskSandboxContainer('foundry-sandbox-task-7-other', 'task-7'), false, 'non-numeric suffix is not a sandbox container');
  assert.equal(isTaskSandboxContainer('unrelated', 'task-7'), false);
  // Slug regex metacharacters are escaped, not interpreted:
  assert.equal(isTaskSandboxContainer('foundry-sandbox-aXb-123456', 'a.b'), false);
  assert.equal(isTaskSandboxContainer('foundry-sandbox-a.b-123456', 'a.b'), true);
});

test('docker ps parsing filters and caps', () => {
  const out = [
    'foundry-sandbox-task-7-1723100000000',
    'foundry-sandbox-task-7-1723100001234',
    'foundry-sandbox-other-1723100000000',
    'malicious --privileged image',
    '',
  ].join('\n');
  assert.deepEqual(parseContainerNames(out, 'task-7'), ['foundry-sandbox-task-7-1723100000000', 'foundry-sandbox-task-7-1723100001234']);
  const many = Array.from({ length: 30 }, (_, i) => `foundry-sandbox-task-7-17231000000${String(i).padStart(2, '0')}`).join('\n');
  assert.equal(parseContainerNames(many, 'task-7').length, 10);
});
