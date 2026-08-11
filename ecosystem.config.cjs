const path = require('path');
const sharedEnv = require('dotenv').config({ path: path.join(__dirname, '.env') }).parsed || {};

module.exports = {
  apps: [
    {
      name: 'foundry-dashboard',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/dashboard -- --hostname 127.0.0.1',
      env: { ...sharedEnv, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3000' },
    },
    {
      name: 'foundry-orchestrator',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/orchestrator',
      env: { ...sharedEnv, NODE_ENV: 'production' },
    },
    {
      name: 'foundry-runner',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/runner',
      env: { ...sharedEnv, NODE_ENV: 'production' },
    },
    {
      name: 'foundry-autonomy',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/autonomy',
      env: { ...sharedEnv, NODE_ENV: 'production' },
    },
  ],
};
