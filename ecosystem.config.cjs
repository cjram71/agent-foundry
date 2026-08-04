module.exports = {
  apps: [
    {
      name: 'foundry-dashboard',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/dashboard',
      env: { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3000' },
    },
    {
      name: 'foundry-orchestrator',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/orchestrator',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'foundry-runner',
      cwd: __dirname,
      script: 'npm',
      args: 'run start --workspace=apps/runner',
      env: { NODE_ENV: 'production' },
    },
  ],
};
