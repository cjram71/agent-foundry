import {NextResponse} from 'next/server';
import {createStarterWorkflow,requiresActivationApproval,validateN8nWorkflow,validateWorkflow,type N8nWorkflow,type WorkflowContract,type WorkflowRisk} from '@foundry/workflows';
import {getSession,isSameOrigin} from '@/lib/auth';
import prisma from '@/lib/prisma';
import {getN8nClient,n8nConfigured} from '@/lib/n8n';
async function admin(request?:Request){const session=await getSession();if(!session)return{error:NextResponse.json({error:'Unauthorized'},{status:401})};if(session.role!=='ADMIN')return{error:NextResponse.json({error:'Forbidden'},{status:403})};if(request&&!isSameOrigin(request))return{error:NextResponse.json({error:'Invalid origin'},{status:403})};return{session};}
export async function GET(){const auth=await admin();if(auth.error)return auth.error;if(!n8nConfigured())return NextResponse.json({configured:false,workflows:[],executions:[]});try{const client=getN8nClient();const [workflows,executions]=await Promise.all([client.list(),client.executions()]);return NextResponse.json({configured:true,workflows:workflows.data,executions:executions.data});}catch(error){return NextResponse.json({configured:true,error:error instanceof Error?error.message:'n8n unavailable',workflows:[],executions:[]},{status:502});}}
export async function POST(request:Request){const auth=await admin(request);if(auth.error)return auth.error;try{
 const body=await request.json() as {projectId?:string;contract?:WorkflowContract;workflow?:N8nWorkflow;risk?:WorkflowRisk};
 if(typeof body.projectId!=='string'||!body.contract)return NextResponse.json({error:'projectId and contract are required'},{status:400});
 const project=await prisma.project.findUnique({where:{id:body.projectId}});if(!project?.authorisedStatus)return NextResponse.json({error:'Project must be authorized'},{status:409});
 const contract={...body.contract,projectId:body.projectId,enabled:true};const contractErrors=validateWorkflow(contract);if(contractErrors.length)return NextResponse.json({error:'Invalid workflow contract',details:contractErrors},{status:400});
 const workflow=body.workflow||createStarterWorkflow(contract);const errors=validateN8nWorkflow(workflow);if(errors.length)return NextResponse.json({error:'Unsafe n8n workflow',details:errors},{status:400});
 if(!n8nConfigured())return NextResponse.json({error:'N8N_API_KEY is not configured',contract,workflow},{status:503});
 const created=await getN8nClient().create(workflow);const risk=body.risk||'medium';const approvalRequired=requiresActivationApproval(risk,contract.actions);
 await prisma.auditEvent.create({data:{actor:auth.session!.userId,action:'workflow.deployed_disabled',target:String(created.id||contract.id),result:'success',metadata:{projectId:body.projectId,contractId:contract.id,version:contract.version,risk,approvalRequired}}});
 return NextResponse.json({workflow:created,contract,approvalRequired,active:false},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Workflow deployment failed'},{status:400});}}
