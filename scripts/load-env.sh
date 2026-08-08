#!/usr/bin/env bash
# Safely load a dotenv file without evaluating its values as shell code.
foundry_load_env() {
  local env_file="${1:-.env}"
  local loader_dir key value
  loader_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  node "$loader_dir/dotenv-export.cjs" "$env_file" --check
  while IFS= read -r -d '' key && IFS= read -r -d '' value; do
    export "$key=$value"
  done < <(node "$loader_dir/dotenv-export.cjs" "$env_file")
}