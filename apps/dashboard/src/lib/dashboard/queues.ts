import { getExecutionQueue, getRedis, getTaskQueue } from '@/lib/queue';
import { EMERGENCY_STOP_KEY, WEDGEABLE_STATES } from '@foundry/ops';
import prisma from '@/lib/prisma';
import type { QueueSnapshot } from './types';
export async function loadQueues(now=new Date()):Promise<{queues:QueueSnapshot[];emergencyStop:boolean}>{
 const redis=getRedis();await redis.ping();const[planCounts,executionCounts,planWaiting,executionWaiting,wedged]=await Promise.all([getTaskQueue().getJobCounts('waiting','active','delayed','failed'),getExecutionQueue().getJobCounts('waiting','active','delayed','failed'),getTaskQueue().getWaiting(0,0),getExecutionQueue().getWaiting(0,0),prisma.task.count({where:{state:{in:[...WEDGEABLE_STATES]},updatedAt:{lt:new Date(now.getTime()-45*60_000)}}})]);
 const oldest=(jobs:Array<{timestamp?:number}>)=>jobs[0]?.timestamp?Math.max(0,Math.floor((now.getTime()-jobs[0].timestamp!)/1000)):null;
 return{emergencyStop:(await redis.get(EMERGENCY_STOP_KEY))!==null,queues:[{name:'plan',waiting:planCounts.waiting||0,active:planCounts.active||0,delayed:planCounts.delayed||0,failed:planCounts.failed||0,oldestWaitingSeconds:oldest(planWaiting),wedgeDetected:false},{name:'execution',waiting:executionCounts.waiting||0,active:executionCounts.active||0,delayed:executionCounts.delayed||0,failed:executionCounts.failed||0,oldestWaitingSeconds:oldest(executionWaiting),wedgeDetected:wedged>0}]};
}
