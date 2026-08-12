export * from './context';

export type MemoryKind='observation'|'episodic'|'knowledge'|'preference'|'decision'|'procedure'|'skill'|'policy';
export type TrustLevel='untrusted'|'reviewed'|'trusted';
export interface MemoryRecord { id:string; kind:MemoryKind; content:string; source:string; sourceReference?:string; projectId?:string; businessId?:string; confidence?:number; sensitivity?:string; trustLevel:TrustLevel; observedAt?:string; reviewAt?:string; expiresAt?:string; provenance:string; embeddingModel?:string; embeddingVersion?:string }
export interface RetrievalResult extends MemoryRecord { lexicalScore?:number; semanticScore?:number; fusedScore:number }
export interface SearchRow extends MemoryRecord { score:number }
export interface MemorySearchStore { lexical(query:string,scope:RetrievalScope,limit:number):Promise<SearchRow[]>; semantic(embedding:number[],scope:RetrievalScope,limit:number):Promise<SearchRow[]> }
export interface RetrievalScope { projectId?:string; businessId?:string; minimumTrust:TrustLevel; now?:Date }
export interface RetrievalOptions { limit?:number; candidateLimit?:number; lexicalWeight?:number; semanticWeight?:number; minimumEvidence?:number }
const trustRank:Record<TrustLevel,number>={untrusted:0,reviewed:1,trusted:2};
export async function retrieveHybrid(store:MemorySearchStore,query:string,embedding:number[],scope:RetrievalScope,options:RetrievalOptions={}):Promise<RetrievalResult[]>{
  if(!query.trim())throw new Error('Query is required'); if(!embedding.length||embedding.some(v=>!Number.isFinite(v)))throw new Error('Embedding must contain finite values'); if(!scope.projectId&&!scope.businessId)throw new Error('A project or business scope is required');
  const limit=Math.min(Math.max(options.limit||10,1),50),candidateLimit=Math.min(Math.max(options.candidateLimit||limit*3,limit),200),lw=options.lexicalWeight??0.45,sw=options.semanticWeight??0.55,threshold=options.minimumEvidence??0.15;
  if(lw<0||sw<0||lw+sw<=0)throw new Error('Invalid fusion weights');
  const [lexical,semantic]=await Promise.all([store.lexical(query,scope,candidateLimit),store.semantic(embedding,scope,candidateLimit)]),byId=new Map<string,RetrievalResult>();
  const accept=(row:SearchRow)=>trustRank[row.trustLevel]>=trustRank[scope.minimumTrust]&&(!row.expiresAt||Date.parse(row.expiresAt)>(scope.now||new Date()).getTime())&&row.provenance.length>0;
  lexical.filter(accept).forEach((row,index)=>byId.set(row.id,{...row,lexicalScore:row.score,fusedScore:lw/(60+index+1)}));
  semantic.filter(accept).forEach((row,index)=>{const current=byId.get(row.id);byId.set(row.id,{...(current||row),semanticScore:row.score,fusedScore:(current?.fusedScore||0)+sw/(60+index+1)});});
  const max=lw/61+sw/61; return [...byId.values()].map(row=>({...row,fusedScore:row.fusedScore/max})).filter(row=>row.fusedScore>=threshold).sort((a,b)=>b.fusedScore-a.fusedScore||a.id.localeCompare(b.id)).slice(0,limit);
}

export interface SqlExecutor { query<T>(sql:string,parameters:readonly unknown[]):Promise<T[]> }
const vectorLiteral=(embedding:number[])=>`[${embedding.map(value=>Number(value).toString()).join(',')}]`;
export class PgVectorMemoryStore implements MemorySearchStore {
  constructor(private readonly db:SqlExecutor){}
  lexical(query:string,scope:RetrievalScope,limit:number):Promise<SearchRow[]>{return this.db.query<SearchRow>(`SELECT *, ts_rank_cd("searchVector", websearch_to_tsquery('english', $1)) AS score FROM "MemoryRecord" WHERE "searchVector" @@ websearch_to_tsquery('english', $1) AND ($2::text IS NULL OR "projectId"=$2) AND ($3::text IS NULL OR "businessId"=$3) AND ("expiresAt" IS NULL OR "expiresAt">NOW()) ORDER BY score DESC LIMIT $4`,[query,scope.projectId||null,scope.businessId||null,limit]);}
  semantic(embedding:number[],scope:RetrievalScope,limit:number):Promise<SearchRow[]>{if(!embedding.length||embedding.some(v=>!Number.isFinite(v)))throw new Error('Invalid embedding');return this.db.query<SearchRow>(`SELECT *, 1-("embedding" <=> $1::vector) AS score FROM "MemoryRecord" WHERE "embedding" IS NOT NULL AND ($2::text IS NULL OR "projectId"=$2) AND ($3::text IS NULL OR "businessId"=$3) AND ("expiresAt" IS NULL OR "expiresAt">NOW()) ORDER BY "embedding" <=> $1::vector LIMIT $4`,[vectorLiteral(embedding),scope.projectId||null,scope.businessId||null,limit]);}
}
