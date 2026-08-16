'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { masterPlanSections } from '@/lib/project-governance';

type Opportunity={id:string;title:string;customer:string};
type Project={id:string;name:string;status:string;latestPlan:{version:number;status:string}|null};

export default function GovernanceControls({opportunities=[],project}:{opportunities?:Opportunity[];project?:Project}){
 const router=useRouter();const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 async function call(method:string,body:unknown){setBusy(true);setMessage('');try{const response=await fetch('/api/project-governance',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');setMessage(data.message||'Saved.');router.refresh();return data}catch(error){setMessage(error instanceof Error?error.message:'Request failed')}finally{setBusy(false)}}
 async function create(opportunity:Opportunity){const owner=window.prompt('GitHub owner:', 'cjram71');if(!owner)return;const repo=window.prompt('GitHub repository:', 'agent-foundry');if(!repo)return;await call('POST',{action:'create_from_opportunity',opportunityId:opportunity.id,name:opportunity.title,githubOwner:owner,githubRepo:repo,spendingLimit:0});}
 async function submit(){if(!project)return;const objective=window.prompt('Master Project Plan objective (all required sections will initially use this controlled brief):');if(!objective||objective.trim().length<20){setMessage('Provide at least 20 characters.');return}const plan=Object.fromEntries(masterPlanSections.map(section=>[section,`${section}: ${objective.trim()}`]));await call('PATCH',{action:'submit_plan',projectId:project.id,plan,changeSummary:'Owner submitted a complete Master Project Plan from the Phase 4 dashboard.'});}
 if(project)return <div className="action-buttons"><button className="button secondary" disabled={busy} onClick={submit}>Submit new plan</button>{project.latestPlan?.status==='PENDING_APPROVAL'?<><button className="button primary" disabled={busy} onClick={()=>call('PATCH',{action:'approve_plan',projectId:project.id})}>Approve plan</button><button className="button danger" disabled={busy} onClick={()=>call('PATCH',{action:'reject_plan',projectId:project.id})}>Reject plan</button></>:null}{message?<span className="muted">{message}</span>:null}</div>;
 return <section className="panel"><div className="panel-head"><div><h2>Approved opportunities awaiting project creation</h2><p>Creation is idempotent and creates no tasks or external actions.</p></div></div><div className="list">{opportunities.map(opportunity=><div className="approval-row" key={opportunity.id}><div><strong>{opportunity.title}</strong><p>{opportunity.customer}</p></div><button className="button primary" disabled={busy} onClick={()=>create(opportunity)}>Create draft project</button></div>)}{!opportunities.length?<p>No approved opportunity is awaiting conversion.</p>:null}</div>{message?<p>{message}</p>:null}</section>;
}
