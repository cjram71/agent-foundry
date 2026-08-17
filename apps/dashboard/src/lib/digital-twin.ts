export const entityTypes=new Set(['company','department','agent','person','customer','product','service','project','task','opportunity','risk','decision','contract','supplier','asset','ip','revenue','cost','campaign','incident','control','evidence','standard']);
export const scenarioActions=new Set(['CREATE','UPDATE','REMOVE']);
export function text(value:unknown,name:string,max=2000){const v=String(value??'').trim();if(!v||v.length>max)throw new Error(`${name} is required`);return v}
export function score(value:unknown,name:string){const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)throw new Error(`${name} must be between 0 and 100`);return n}
export function integer(value:unknown,name:string,min=1,max=3650){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${name} is invalid`);return n}
export function attentionPriority(value:number,urgency:number,impact:number,minutes:number){return Number(((value*0.35+urgency*0.3+impact*0.35)/(Math.max(1,minutes)**0.25)).toFixed(4))}
export function json(value:unknown){return value&&typeof value==='object'?value:{} }
