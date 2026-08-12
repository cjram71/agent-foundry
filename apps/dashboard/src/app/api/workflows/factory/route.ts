import {NextResponse} from 'next/server';
import {draftWorkflow,recommendProjectAutomations,validateN8nWorkflow,validateWorkflow,type N8nWorkflow,type WorkflowContract,type WorkflowRisk} from '@foundry/workflows';
import {getSession,isSameOrigin} from '@/lib/auth';
import prisma from '@/lib/prisma';
async function requireAdmin(request:Request){const session=await getSession();if(!session)return{error:NextResponse.json({error:'Unauthorized'},{status:401})};if(session.role!=='ADMIN')return{error:NextResponse.json({error:'Forbidden'},{status:403})};if(!isSameOrigin(request))return{error:NextResponse.json({error:'Invalid origin'},{status:403})};return{session};}
export async function POST(request:Request){const auth=await requireAdmin(request);if(auth.error)return auth.error;try{
 const body=await request.json() as {action?:string;projectId?:string;intent?:string;risk?:WorkflowRisk;contract?:WorkflowContract;workflow?:N8nWorkflow};
 if(typeof body.projectId!=='string')return NextResponse.json({error:'projectId is required'},{status:400});
 const project=await prisma.project.findUnique({where:{id:body.projectId},include:{tasks:{select:{state:true}}}});
 if(!project?.authorisedStatus)return NextResponse.json({error:'Project must be authorized'},{status:409});
 if(body.action==='recommend'){const taskCounts=project.tasks.reduce<Record<string,number>>((all,task)=>({...all,[task.state]:(all[task.state]||0)+1}),{});return NextResponse.json({recommendations:recommendProjectAutomations({projectId:project.id,projectName:project.name,productionUrl:project.productionUrl,taskCounts})});}
 if(body.action==='draft'){if(typeof body.intent!=='string'||body.intent.trim().length<12)return NextResponse.json({error:'Describe the automation in at least 12 characters'},{status:400});return NextResponse.json(draftWorkflow(project.id,project.name,body.intent.trim(),body.risk||'medium'));}
 if(body.action==='validate'){if(!body.contract||!body.workflow)return NextResponse.json({error:'contract and workflow are required'},{status:400});const contract={...body.contract,projectId:project.id,enabled:true};const contractErrors=validateWorkflow(contract),workflowErrors=validateN8nWorkflow(body.workflow);return NextResponse.json({valid:contractErrors.length===0&&workflowErrors.length===0,contractErrors,workflowErrors,safeTest:{mode:'dry-run',passed:contractErrors.length===0&&workflowErrors.length===0,executedExternalActions:false}});}
 return NextResponse.json({error:'action must be recommend, draft, or validate'},{status:400});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Workflow factory request failed'},{status:400});}}
