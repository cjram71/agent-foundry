export const frameworks=new Set(['ISO_9001','ISO_27001','ISO_42001','ISO_20000_1','ISO_27701','ISO_31000','ISO_37301','ISO_22301','ISO_56002','ISO_37001','ISO_12207','ISO_25010']);
export const improvementTargets=new Set(['SOP','POLICY','AGENT','PROCESS','CONSTITUTION','PERMANENT_MEMORY']);
export const agentActions=new Set(['PROMOTE','RETRAIN','RECONFIGURE','REPLACE','RETIRE']);
export function readiness(evidence:Array<{result:string;expiresAt:Date}>,now=new Date()){if(!evidence.length)return'MISSING';if(evidence.some(x=>x.expiresAt<=now))return'EXPIRED';if(evidence.some(x=>x.result!=='PASS'))return'GAP';return'READY'}
export function mayApplyProposal(target:string,status:string){return status==='APPROVED'&&!['CONSTITUTION','PERMANENT_MEMORY'].includes(target)}
export function text(v:unknown,n:string,max=4000){if(typeof v!=='string'||!v.trim())throw new Error(`${n} is required`);return v.trim().slice(0,max)}
