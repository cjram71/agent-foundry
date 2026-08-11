import type { HostSnapshot } from './types';

const queries={cpu:'100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',memoryUsed:'node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes',memoryTotal:'node_memory_MemTotal_bytes',diskUsed:'node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}',diskTotal:'node_filesystem_size_bytes{mountpoint="/"}',load1:'node_load1',load5:'node_load5',load15:'node_load15'} as const;
type QueryKey=keyof typeof queries;

export class PrometheusAdapter {
  private readonly baseUrl:string;
  private readonly request:typeof fetch;
  private readonly timeoutMs:number;
  constructor(baseUrl=process.env.PROMETHEUS_URL||'http://127.0.0.1:9090',request:typeof fetch=fetch,timeoutMs=2500){this.baseUrl=baseUrl;this.request=request;this.timeoutMs=timeoutMs;}
  private async scalar(key:QueryKey):Promise<number|null>{try{const url=new URL('/api/v1/query',this.baseUrl);url.searchParams.set('query',queries[key]);const response=await this.request(url,{signal:AbortSignal.timeout(this.timeoutMs),cache:'no-store'});if(!response.ok)return null;const body=await response.json()as{status?:string;data?:{result?:Array<{value?:[number,string]}>}};const raw=body.data?.result?.[0]?.value?.[1],value=raw===undefined?NaN:Number(raw);return Number.isFinite(value)?value:null}catch{return null}}
  async host():Promise<HostSnapshot>{const[cpuPercent,memoryUsedBytes,memoryTotalBytes,diskUsedBytes,diskTotalBytes,load1,load5,load15]=await Promise.all((Object.keys(queries)as QueryKey[]).map(key=>this.scalar(key)));return{cpuPercent,memoryUsedBytes,memoryTotalBytes,diskUsedBytes,diskTotalBytes,load1,load5,load15}}
}
