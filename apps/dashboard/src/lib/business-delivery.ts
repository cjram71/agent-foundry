export const productTypes = new Set(['book','ebook','audiobook','workbook','course','template','assistant','app','saas','api','consulting','licensing']);
export const productStages = ['IDEA','VALIDATION','MVP','TESTING','BUILD','SECURITY','QUALITY','LAUNCH','SALE','MEASUREMENT','IMPROVEMENT'] as const;
export const requiredLaunchGates = ['quality','security','legal-rights','commercial','operations'] as const;
export const feedbackRoutes = ['PRODUCT','MARKETING','SALES','CEO','OPPORTUNITY_ENGINE'] as const;
export const salesStages = ['LEAD','QUALIFIED','PROPOSAL','NEGOTIATION','CONTRACTED','WON','LOST'] as const;
export function boundedText(value:unknown,name:string,max=2000){if(typeof value!=='string'||!value.trim())throw new Error(`${name} is required`);return value.trim().slice(0,max)}
export function nonNegativeMinor(value:unknown,name:string){const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw new Error(`${name} must be a non-negative integer`);return BigInt(number)}
export function canLaunch(gates:Array<{gate:string;status:string}>,humanApproved:boolean){return humanApproved&&requiredLaunchGates.every(gate=>gates.some(row=>row.gate===gate&&row.status==='PASS'))}
export function saleNeedsApproval(stage:string,valueMinor:bigint,riskLevel:string,partnership:boolean){return['CONTRACTED','WON'].includes(stage)||valueMinor>=BigInt(1_000_000)||['high','prohibited'].includes(riskLevel)||partnership}
export function validSalesStage(value:unknown):value is typeof salesStages[number]{return salesStages.includes(value as typeof salesStages[number])}
export function feedbackKey(value:unknown){const key=boundedText(value,'idempotencyKey',200);if(!/^[A-Za-z0-9_.:-]+$/.test(key))throw new Error('Invalid idempotencyKey');return key}
