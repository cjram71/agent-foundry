export const complianceFrameworks=new Set(['GDPR','EU_AI_ACT','CONTRACTS','COPYRIGHT','PRIVACY','CONSUMER','VENDOR','TAX_LEGAL']);
export const securityDomains=new Set(['IDENTITY','VULNERABILITY','THREAT_INTELLIGENCE','MONITORING','APPLICATION','CLOUD','DATA','AI','SUPPLY_CHAIN','AUDIT']);
export const incidentFlow=['DETECTED','CLASSIFIED','CONTAINED','INVESTIGATED','RECOVERED','VALIDATED','REPORTED','ROOT_CAUSE','CORRECTED','LEARNED'] as const;
export function text(v:unknown,n:string,max=3000){if(typeof v!=='string'||!v.trim())throw new Error(`${n} is required`);return v.trim().slice(0,max)}
export function minor(v:unknown){const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw new Error('amountMinor must be a non-negative integer');return BigInt(n)}
export function critical(severity:string){return severity==='CRITICAL'}
export function legalLabel(status:string){return `${status} readiness — not certification`}
export function nextIncidentState(current:string,next:string){const a=incidentFlow.indexOf(current as any),b=incidentFlow.indexOf(next as any);return a>=0&&b===a+1}
