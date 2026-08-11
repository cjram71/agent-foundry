#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(message, code = 1) {
  console.error(`checkpoint-gate: FAIL: ${message}`);
  process.exit(code);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/gizmo-checkpoint-gate.js /srv/gizmo/checkpoints/phase-XX.json');
  process.exit(2);
}

const fullPath = path.resolve(file);
if (!fs.existsSync(fullPath)) fail(`checkpoint does not exist: ${fullPath}`, 2);

let checkpoint;
try {
  checkpoint = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
} catch (error) {
  fail(`invalid JSON: ${error.message}`, 2);
}

const required = ['phaseId', 'phaseName', 'status', 'gitSha', 'builder', 'startedAt', 'checks', 'rollbackReady'];
for (const key of required) {
  if (checkpoint[key] === undefined || checkpoint[key] === null || checkpoint[key] === '') {
    fail(`missing required field: ${key}`, 2);
  }
}

if (checkpoint.status !== 'PASS') fail(`checkpoint status is ${checkpoint.status}, expected PASS`);
if (!Array.isArray(checkpoint.checks) || checkpoint.checks.length === 0) fail('no verification checks recorded', 2);

const failedMandatory = checkpoint.checks.filter((check) => check && check.mandatory === true && check.result !== 'PASS');
if (failedMandatory.length) {
  fail(`mandatory checks not passing: ${failedMandatory.map((check) => check.id || '<unnamed>').join(', ')}`);
}

if (checkpoint.rollbackReady !== true) fail('rollbackReady must be true before phase progression');

if (checkpoint.humanApproval?.required === true && checkpoint.humanApproval.status !== 'APPROVED') {
  fail(`human approval required but status is ${checkpoint.humanApproval.status || 'missing'}`);
}

console.log(`checkpoint-gate: PASS: ${checkpoint.phaseId} ${checkpoint.phaseName}`);
console.log(`checkpoint-gate: git=${checkpoint.gitSha} builder=${checkpoint.builder}`);
console.log(`checkpoint-gate: mandatory-checks=${checkpoint.checks.filter((check) => check.mandatory === true).length}`);
process.exit(0);
