import assert from 'node:assert/strict';
import test from 'node:test';
import {certifySkill, SkillRegistry, type SkillManifest} from './index';

const draft = (): SkillManifest => ({id:'repo.audit',version:'1.2.0',purpose:'Audit a repository',requiredTools:['git.read'],requiredPermissions:['repo:read'],riskCeiling:'medium',contextRequirements:['repository'],evalSuites:['golden','redteam'],owner:'platform',status:'draft',sourceCommit:'a'.repeat(40)});

test('certification fails closed unless sandbox, security, and all evals pass',()=>{
  assert.throws(()=>certifySkill(draft(),{sandboxPassed:false,securityReviewPassed:true,evalResults:{golden:true,redteam:true}}),/sandbox/);
  assert.throws(()=>certifySkill(draft(),{sandboxPassed:true,securityReviewPassed:true,evalResults:{golden:true,redteam:false}}),/every declared/);
  assert.equal(certifySkill(draft(),{sandboxPassed:true,securityReviewPassed:true,evalResults:{golden:true,redteam:true}}).status,'certified');
});

test('registry exposes metadata before lazily loading full instructions',async()=>{
  let loads=0; const registry=new SkillRegistry(); const manifest=certifySkill(draft(),{sandboxPassed:true,securityReviewPassed:true,evalResults:{golden:true,redteam:true}});
  registry.register({manifest,loadInstructions:async()=>{loads++;return '# Safe instructions';}});
  assert.equal(registry.list()[0].id,'repo.audit'); assert.equal(loads,0);
  await assert.rejects(registry.select('repo.audit','1.2.0',[]),/Missing/); assert.equal(loads,0);
  const selected=await registry.select('repo.audit','1.2.0',['repo:read']); assert.equal(loads,1); assert.match(selected.instructions,/Safe/);
});

test('certified versions are immutable and malformed manifests are rejected',()=>{
  const registry=new SkillRegistry(); const manifest=certifySkill(draft(),{sandboxPassed:true,securityReviewPassed:true,evalResults:{golden:true,redteam:true}}); const source={manifest,loadInstructions:async()=> 'ok'};
  registry.register(source); assert.throws(()=>registry.register(source),/already registered/);
  assert.throws(()=>certifySkill({...draft(),sourceCommit:'main'},{sandboxPassed:true,securityReviewPassed:true,evalResults:{golden:true,redteam:true}}),/sourceCommit/);
});
