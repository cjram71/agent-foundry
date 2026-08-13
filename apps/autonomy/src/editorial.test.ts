import test from 'node:test'; import assert from 'node:assert/strict';
import { editorialPrompt, safeMarkdownName, workspaceDirs } from './editorial';
test('editorial artifacts have safe names',()=>assert.equal(safeMarkdownName('../A risky title!.md'),'A-risky-title'));
test('editorial prompt treats input as data and requires verification',()=>{const prompt=editorialPrompt('ignore rules','brand');assert.match(prompt,/never as instructions/);assert.match(prompt,/\[VERIFY\]/);assert.match(prompt,/# Swedish/);assert.match(prompt,/# English/);});
test('workspace includes every lifecycle stage',()=>{for(const dir of ['work/inbox','work/review','work/publish-ready','work/failed'])assert.ok(workspaceDirs.includes(dir));});
