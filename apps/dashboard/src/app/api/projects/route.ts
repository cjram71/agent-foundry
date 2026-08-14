import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { parsePublicUrl, projectTypes } from '@/lib/validation';
import { enqueuePlan } from '@/lib/queue';
import { transitionTask, emitTaskEvent } from '@foundry/state-machine';
import { isPolicyCeiling } from '@foundry/policy';
import { checkSpendGuard } from '@/lib/cost';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

async function requireAdmin(request?: Request) { const session=await getSession();if(!session)return{error:NextResponse.json({error:'Unauthorized'},{status:401})};if(session.role!=='ADMIN')return{error:NextResponse.json({error:'Forbidden'},{status:403})};if(request&&!isSameOrigin(request))return{error:NextResponse.json({error:'Invalid origin'},{status:403})};return{session}; }
export async function GET(){const auth=await requireAdmin();if(auth.error)return auth.error;return NextResponse.json(await prisma.project.findMany({where:{companyId:BOOSTA_COMPANY_ID},orderBy:{createdAt:'desc'},include:{_count:{select:{tasks:true}}}}));}
export async function POST(request:Request){const auth=await requireAdmin(request);if(auth.error)return auth.error;return NextResponse.json({error:'Boosta OS is a single-company system. Workspaces are created only by approved company workflows.'},{status:405,headers:{Allow:'GET, PATCH'}});}
export async function PATCH(request:Request){try{const auth=await requireAdmin(request);if(auth.error)return auth.error;const body=await request.json();if(typeof body.id!=='string')return NextResponse.json({error:'Project id is required'},{status:400});if(body.action==='authorize'||body.action==='deauthorize'){
  const authorisedStatus=body.action==='authorize';
  if(authorisedStatus){
    const spend=await checkSpendGuard(body.id);
    if(!spend.allowed){await prisma.auditEvent.create({data:{actor:auth.session!.userId,action:'cost.spend_blocked',target:body.id,result:'rejected',metadata:{stage:'authorize_manager_evaluation',spendUsd:spend.spendUsd,limitUsd:spend.limitUsd}}});return NextResponse.json({error:spend.reason},{status:409});}
  }
  const project=await prisma.project.update({where:{id:body.id},data:{authorisedStatus},include:{_count:{select:{tasks:true}}}});
  await prisma.auditEvent.create({data:{actor:auth.session!.userId,action:authorisedStatus?'project.authorized':'project.deauthorized',target:project.id,result:'success'}});
  let managerTaskId:string|undefined;
  if(authorisedStatus&&project.projectType!=='company_discovery'){
    const active=await prisma.task.findFirst({where:{projectId:project.id,title:{startsWith:'AI Project Manager Evaluation'},status:{in:['draft','planning','awaiting_plan_approval','approved','queued','coding','testing','reviewing','awaiting_human_review','approved_for_merge']}}});
    if(active) managerTaskId=active.id;
    else {
      const instruction=`Act as the AI Project Manager for ${project.name}. Automatically evaluate the repository ${project.githubOwner}/${project.githubRepo}, its current product state, target users, likely market, research needs, branding, marketing, content, operations, inventory or suppliers when relevant, technical architecture, security, privacy, deployment, analytics, budget, timeline, risks, and success measures. Select the specialist personnel needed from the verified agent catalog and produce a phased master plan with dependencies, deliverables, acceptance criteria, owner questions, and explicit approval gates. Where business details are unknown, identify them as questions and do not invent commitments. Do not execute work, spend money, publish, contact third parties, or merge code.`;
      const task=await prisma.$transaction(async tx=>{const created=await tx.task.create({data:{projectId:project.id,title:`AI Project Manager Evaluation — ${project.name}`,completeInstruction:instruction,riskLevel:'high'}});await emitTaskEvent(tx,{taskId:created.id,type:'task_created',actor:'ai-project-manager',actorType:'system',payload:{projectId:project.id,evaluation:true}});await transitionTask(tx,{taskId:created.id,to:'PLANNING',actor:'ai-project-manager',actorType:'system',reason:'manager evaluation queued',legacyStatus:'planning',extraTaskData:{startedAt:new Date()}});return created;});managerTaskId=task.id;
      try{const{job,deduplicated}=await enqueuePlan(task.id);await prisma.auditEvent.create({data:{actor:'ai-project-manager',action:'project.manager_evaluation_queued',target:project.id,result:'success',metadata:{taskId:task.id,jobId:job.id,deduplicated}}});}
      catch{await transitionTask(prisma,{taskId:task.id,to:'FAILED',actor:'ai-project-manager',actorType:'system',reason:'planning queue unavailable',legacyStatus:'failed'});await prisma.auditEvent.create({data:{actor:'ai-project-manager',action:'project.manager_evaluation_queued',target:project.id,result:'failed',metadata:{taskId:task.id}}});}
    }
  }
  return NextResponse.json({...project,managerTaskId});
}if(body.action==='update_spending_limit'){
  const spendingLimit=Number(body.spendingLimit);
  if(!Number.isFinite(spendingLimit)||spendingLimit<0||spendingLimit>100000)throw new Error('Spending limit must be a number between 0 and 100000 (0 disables the brake)');
  const before=await prisma.project.findUnique({where:{id:body.id},select:{spendingLimit:true}});
  if(!before)return NextResponse.json({error:'Project not found'},{status:404});
  const project=await prisma.project.update({where:{id:body.id},data:{spendingLimit},include:{_count:{select:{tasks:true}}}});
  await prisma.auditEvent.create({data:{actor:auth.session!.userId,action:'project.spending_limit_updated',target:project.id,result:'success',metadata:{previousLimit:before.spendingLimit,newLimit:spendingLimit}}});
  return NextResponse.json(project);
}
if(body.action==='update_policy'){
  if(!isPolicyCeiling(body.maxTaskRisk))return NextResponse.json({error:"maxTaskRisk must be 'low', 'medium', or 'high'. Prohibited work is never allowed and cannot be configured."},{status:400});
  const exists=await prisma.project.findUnique({where:{id:body.id},select:{id:true}});if(!exists)return NextResponse.json({error:'Project not found'},{status:404});
  const policy=await prisma.$transaction(async tx=>{
    const latest=await tx.projectPolicy.findFirst({where:{projectId:body.id},orderBy:{version:'desc'},select:{version:true,maxTaskRisk:true,active:true}});
    if(latest&&latest.active&&latest.maxTaskRisk===body.maxTaskRisk)return null;
    await tx.projectPolicy.updateMany({where:{projectId:body.id,active:true},data:{active:false}});
    const created=await tx.projectPolicy.create({data:{projectId:body.id,version:(latest?.version??0)+1,active:true,maxTaskRisk:body.maxTaskRisk,createdBy:auth.session!.userId}});
    await tx.auditEvent.create({data:{actor:auth.session!.userId,action:'project.policy_updated',target:body.id,result:'success',metadata:{version:created.version,maxTaskRisk:created.maxTaskRisk}}});
    return created;
  });
  if(!policy)return NextResponse.json({message:'That policy ceiling is already active.',unchanged:true});
  return NextResponse.json({policy});
}if(body.action==='update_public_link'){const projectType=typeof body.projectType==='string'?body.projectType:'web_app';if(!projectTypes.has(projectType))throw new Error('Invalid project type');const productionUrl=parsePublicUrl(body.productionUrl);const project=await prisma.project.update({where:{id:body.id},data:{projectType,productionUrl},include:{_count:{select:{tasks:true}}}});await prisma.auditEvent.create({data:{actor:auth.session!.userId,action:'project.public_link_updated',target:project.id,result:'success',metadata:{projectType,productionUrl}}});return NextResponse.json(project);}return NextResponse.json({error:'Invalid project action'},{status:400});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Project update failed'},{status:400});}}
export async function DELETE(request:Request){const auth=await requireAdmin(request);if(auth.error)return auth.error;return NextResponse.json({error:'Boosta workspaces cannot be deleted from the dashboard.'},{status:405,headers:{Allow:'GET, PATCH'}});}