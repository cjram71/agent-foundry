export type ToolRisk = 'low' | 'medium' | 'high';
export type Validator = (value: unknown) => boolean;
export interface ToolContract { id:string; description:string; action:string; requiredPermission:string; risk:ToolRisk; approvalRequired:boolean; credentialReference?:string; timeoutMs:number; maxRetries:number; rateLimitPerMinute:number; audit:boolean; idempotent:boolean; validateInput:Validator; validateOutput:Validator }
export interface ToolInvocationContext { missionId?:string; taskId?:string; actor:string; correlationId?:string; permissions:readonly string[]; approvedActions?:readonly string[] }
export interface ToolAudit { actor:string; toolId:string; action:string; result:'allowed'|'denied'|'success'|'failed'; reason?:string; missionId?:string; taskId?:string; correlationId?:string; attempt?:number; durationMs?:number }
export type ToolHandler = (input:unknown, context:ToolInvocationContext, signal:AbortSignal)=>Promise<unknown>;
export type AuditSink = (event:ToolAudit)=>Promise<void>;

interface Registered { contract:ToolContract; handler:ToolHandler }
export class ToolGateway {
  private readonly tools = new Map<string,Registered>();
  private readonly rates = new Map<string,number[]>();
  constructor(private readonly auditSink:AuditSink, private readonly now:()=>number=Date.now) {}
  register(contract:ToolContract, handler:ToolHandler):void {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(contract.id)) throw new Error('Invalid tool id');
    if (this.tools.has(contract.id)) throw new Error(`Duplicate tool ${contract.id}`);
    if (contract.risk === 'high' && !contract.approvalRequired) throw new Error('High-risk tools must require approval');
    if (!contract.audit) throw new Error('All registered tools must be audited');
    if (!Number.isInteger(contract.timeoutMs) || contract.timeoutMs < 1 || contract.timeoutMs > 900_000) throw new Error('Invalid tool timeout');
    if (!Number.isInteger(contract.maxRetries) || contract.maxRetries < 0 || contract.maxRetries > 3) throw new Error('Invalid retry limit');
    if (!contract.idempotent && contract.maxRetries > 0) throw new Error('Non-idempotent tools cannot retry');
    if (!Number.isInteger(contract.rateLimitPerMinute) || contract.rateLimitPerMinute < 1 || contract.rateLimitPerMinute > 600) throw new Error('Invalid rate limit');
    this.tools.set(contract.id,{contract,handler});
  }
  list():Array<Omit<ToolContract,'validateInput'|'validateOutput'|'credentialReference'>> { return [...this.tools.values()].map(({contract})=>({id:contract.id,description:contract.description,action:contract.action,requiredPermission:contract.requiredPermission,risk:contract.risk,approvalRequired:contract.approvalRequired,timeoutMs:contract.timeoutMs,maxRetries:contract.maxRetries,rateLimitPerMinute:contract.rateLimitPerMinute,audit:contract.audit,idempotent:contract.idempotent})); }
  async invoke(toolId:string,input:unknown,context:ToolInvocationContext):Promise<unknown> {
    const item=this.tools.get(toolId); if(!item) return this.deny(toolId,'unknown tool',context);
    const {contract,handler}=item;
    if(!context.permissions.includes(contract.requiredPermission)) return this.deny(toolId,'missing permission',context,contract.action);
    if(contract.approvalRequired&&!context.approvedActions?.includes(contract.action)) return this.deny(toolId,'approval required',context,contract.action);
    if(!contract.validateInput(input)) return this.deny(toolId,'invalid input',context,contract.action);
    const key=`${context.actor}:${toolId}`, cutoff=this.now()-60_000, recent=(this.rates.get(key)||[]).filter(value=>value>cutoff);
    if(recent.length>=contract.rateLimitPerMinute) return this.deny(toolId,'rate limit exceeded',context,contract.action);
    recent.push(this.now()); this.rates.set(key,recent);
    await this.auditSink(this.event(context,contract,'allowed'));
    const attempts=contract.idempotent?contract.maxRetries+1:1;
    for(let attempt=1;attempt<=attempts;attempt++){
      const started=this.now(), controller=new AbortController(), timer=setTimeout(()=>controller.abort(),contract.timeoutMs);
      try{
        const result=await Promise.race([handler(input,context,controller.signal),new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Tool invocation timed out')),{once:true}))]);
        if(!contract.validateOutput(result)) throw new Error('Tool returned invalid output');
        await this.auditSink({...this.event(context,contract,'success'),attempt,durationMs:this.now()-started}); clearTimeout(timer); return result;
      }catch(error){ clearTimeout(timer); const final=attempt===attempts; await this.auditSink({...this.event(context,contract,final?'failed':'allowed'),reason:final?(error instanceof Error?error.message:'tool failed'):'retry',attempt,durationMs:this.now()-started}); if(final) throw error; }
    }
    throw new Error('Tool invocation failed');
  }
  private event(context:ToolInvocationContext,contract:Pick<ToolContract,'id'|'action'>,result:ToolAudit['result']):ToolAudit{return{actor:context.actor,toolId:contract.id,action:contract.action,result,missionId:context.missionId,taskId:context.taskId,correlationId:context.correlationId};}
  private async deny(toolId:string,reason:string,context:ToolInvocationContext,action='unknown'):Promise<never>{await this.auditSink({actor:context.actor,toolId,action,result:'denied',reason,missionId:context.missionId,taskId:context.taskId,correlationId:context.correlationId});throw new Error(`Tool denied: ${reason}`);}
}
