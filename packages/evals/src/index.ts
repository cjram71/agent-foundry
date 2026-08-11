export type EvalKind='golden'|'redteam'|'regression';
export interface EvalCase{id:string;kind:EvalKind;component:string;input:unknown;expected:unknown;rubric?:string;risk?:'low'|'medium'|'high'}
export interface EvalResult{caseId:string;passed:boolean;score?:number;notes?:string;baselineDelta?:number;reviewer?:string}
export interface EvalBaseline{id:string;approved:boolean;minimumScore:number;mandatoryKinds:readonly EvalKind[]}
export interface EvalGateResult{passed:boolean;failures:string[];results:EvalResult[]}
export async function runEvalGate(cases:readonly EvalCase[],baseline:EvalBaseline,execute:(item:EvalCase)=>Promise<EvalResult>):Promise<EvalGateResult>{
 if(!baseline.approved)throw new Error('Eval baseline is not approved');if(!cases.length)throw new Error('Eval cases are required');
 const kinds=new Set(cases.map(item=>item.kind));const failures=baseline.mandatoryKinds.filter(kind=>!kinds.has(kind)).map(kind=>`Missing mandatory ${kind} suite`);
 const ids=new Set<string>();for(const item of cases){if(ids.has(item.id))failures.push(`Duplicate eval case: ${item.id}`);ids.add(item.id)}
 const results:EvalResult[]=[];for(const item of cases){const result=await execute(item);results.push(result);if(result.caseId!==item.id)failures.push(`Mismatched result for ${item.id}`);if(!result.passed)failures.push(`${item.id} failed`);if((result.score??0)<baseline.minimumScore)failures.push(`${item.id} below baseline score`);if(item.risk==='high'&&!result.reviewer)failures.push(`${item.id} requires independent review`);if((result.baselineDelta??0)<0)failures.push(`${item.id} regressed from baseline`)}
 return{passed:failures.length===0,failures,results};
}
