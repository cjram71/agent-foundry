#!/usr/bin/env node
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/gizmo-build-manifest.json'), 'utf8'));
let failed = false;
for (const component of manifest.components) {
  if (component.requiredMarker) {
    const marker = path.join(root, component.requiredMarker);
    if (!fs.existsSync(marker)) {
      console.error(`BLOCKED ${component.id}: missing certified runtime marker ${component.requiredMarker}`);
      failed = true;
      continue;
    }
  }
  if (component.verify) {
    const result = cp.spawnSync('/bin/bash', ['-lc', component.verify], {stdio: 'inherit', env: process.env});
    if (result.status !== 0) {
      console.error(`FAIL ${component.id}: verification command failed`);
      failed = true;
      continue;
    }
  }
  console.log(`PASS ${component.id}`);
}
if (failed) {
  console.error('GIZMO COMPLETE BUILD: NOT READY');
  process.exit(1);
}
console.log('GIZMO COMPLETE BUILD: PASS');
