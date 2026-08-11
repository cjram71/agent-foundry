#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -ne 0 ]] || { echo 'Do not install/run Codex as root.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required' >&2; exit 1; }
npm install -g @openai/codex
codex --version
cat <<'EOF'
Codex installed. Authentication must be completed by the operator (for example `codex --login` or approved API-key provisioning). Gizmo policy forbids root execution and forbids Codex from bypassing Runner validation/approval gates.
EOF
