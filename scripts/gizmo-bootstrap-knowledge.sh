#!/usr/bin/env bash
set -euo pipefail
VAULT="${GIZMO_KNOWLEDGE_DIR:-/srv/gizmo/knowledge-vault}"
for d in 00-Inbox 10-Missions 20-Projects 30-Businesses 40-Knowledge 50-Decisions 60-Skills 70-Runbooks 80-Reports 90-Archive Templates Generated; do
  mkdir -p "$VAULT/$d"
done
cat > "$VAULT/README.md" <<'EOF'
# Gizmo Knowledge Vault
Human-readable knowledge mirror. Do not store passwords, API keys, private keys, session tokens, or raw secrets here. Durable machine state remains in PostgreSQL. Generated notes must record provenance/source references.
EOF
chmod -R go-w "$VAULT"
echo "Knowledge vault ready: $VAULT"
