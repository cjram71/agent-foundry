#!/usr/bin/env bash
set -euo pipefail
ROOT="${BOOSTA_WORKSPACE_ROOT:-/srv/boosta}"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/boosta"
install -d -m 0750 "$ROOT/company" "$ROOT/work/inbox" "$ROOT/work/processing" "$ROOT/work/review" "$ROOT/work/approved" "$ROOT/work/publish-ready" "$ROOT/work/published" "$ROOT/work/failed" "$ROOT/templates" "$ROOT/assets" "$ROOT/reports" "$ROOT/archive"
for file in "$SOURCE"/company/*.md; do install -m 0640 -C "$file" "$ROOT/company/$(basename "$file")"; done
for file in "$SOURCE"/templates/*.md; do install -m 0640 -C "$file" "$ROOT/templates/$(basename "$file")"; done
printf 'Boosta workspace ready: %s\n' "$ROOT"
