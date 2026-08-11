#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/gizmo-scan-n8n-template.js workflow.json');
  process.exit(2);
}
let workflow;
try { workflow = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error(`Invalid workflow JSON: ${e.message}`); process.exit(2); }

const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
const findings = [];
const credentials = new Set();
const nodeTypes = new Set();
const externalUrls = new Set();
const riskyPatterns = [
  ['code-execution', /code|function|executecommand|ssh/i, 'high'],
  ['filesystem', /readwritefile|localfile|filesystem|ftp/i, 'high'],
  ['webhook', /webhook/i, 'medium'],
  ['email-send', /gmail|email|smtp|outlook/i, 'medium'],
  ['social-send', /telegram|slack|discord|whatsapp|twitter|linkedin|facebook|instagram/i, 'medium'],
  ['database', /postgres|mysql|mongo|redis|supabase|qdrant|pinecone/i, 'medium'],
  ['http-request', /httprequest/i, 'medium'],
];

function walk(value) {
  if (!value) return;
  if (typeof value === 'string') {
    const matches = value.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const url of matches) {
      try { externalUrls.add(new URL(url).hostname); } catch {}
    }
    return;
  }
  if (Array.isArray(value)) return value.forEach(walk);
  if (typeof value === 'object') Object.values(value).forEach(walk);
}

for (const node of nodes) {
  const type = String(node.type || 'unknown');
  nodeTypes.add(type);
  for (const key of Object.keys(node.credentials || {})) credentials.add(key);
  for (const [kind, pattern, severity] of riskyPatterns) {
    if (pattern.test(type) || pattern.test(String(node.name || ''))) {
      findings.push({severity, kind, node: node.name || type, type});
    }
  }
  walk(node.parameters);
}

const severe = findings.some(f => f.severity === 'high');
const report = {
  source: path.resolve(file),
  workflowName: workflow.name || path.basename(file),
  nodes: nodes.length,
  nodeTypes: [...nodeTypes].sort(),
  credentials: [...credentials].sort(),
  externalDomains: [...externalUrls].sort(),
  findings,
  recommendation: severe ? 'REVIEW_REQUIRED' : findings.length ? 'REVIEW_RECOMMENDED' : 'CANDIDATE',
  activationAllowed: false,
};
console.log(JSON.stringify(report, null, 2));
process.exit(severe ? 3 : 0);
