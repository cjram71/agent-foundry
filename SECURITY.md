# Security policy

Do not report security issues in public issues. Contact the repository owner privately.

Never commit live environment files, API keys, GitHub tokens, GitHub App private keys, database dumps, Redis data, model binaries, generated workspaces, or logs.

Before deployment:

- rotate all secrets copied from another system;
- restrict GitHub access to required repositories;
- bind internal services to localhost or Tailscale;
- enable a deny-by-default firewall;
- require TLS when using a public reverse proxy;
- review plans and draft pull requests before approval;
- keep automatic merging disabled;
- patch Ubuntu, Docker, Node.js, and dependencies regularly.
