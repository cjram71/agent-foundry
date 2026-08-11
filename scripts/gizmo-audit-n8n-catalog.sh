#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CATALOG="${GIZMO_CATALOG_DIR:-/srv/gizmo/catalogs}/n8n/awesome-n8n-templates"
OUT="${GIZMO_ROOT:-/srv/gizmo}/generated/n8n-catalog-audit"
[[ -d "$CATALOG" ]] || { echo "Missing catalog: $CATALOG" >&2; exit 1; }
mkdir -p "$OUT"
count=0 review=0
while IFS= read -r -d '' file; do
  rel=${file#"$CATALOG"/}
  safe=$(printf '%s' "$rel" | tr '/ ' '__' | tr -cd 'A-Za-z0-9_.-')
  if node "$REPO_ROOT/scripts/gizmo-scan-n8n-template.js" "$file" > "$OUT/${safe}.report.json"; then
    :
  else
    code=$?
    if [[ $code -eq 3 ]]; then review=$((review+1)); else echo "Scanner error: $rel" >&2; exit "$code"; fi
  fi
  count=$((count+1))
done < <(find "$CATALOG" -type f -name '*.json' -print0)
printf '{"scanned":%d,"reviewRequired":%d,"catalogCommit":"%s"}\n' "$count" "$review" "$(git -C "$CATALOG" rev-parse HEAD)" > "$OUT/summary.json"
echo "Catalog audit complete: $count workflows; $review high-risk review-required. No workflow was imported or activated."
