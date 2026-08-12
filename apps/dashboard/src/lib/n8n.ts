import {N8nClient} from '@foundry/workflows';
export function getN8nClient(){return new N8nClient(process.env.N8N_URL||'http://127.0.0.1:5678',process.env.N8N_API_KEY||'');}
export function n8nConfigured(){return Boolean(process.env.N8N_API_KEY);}
