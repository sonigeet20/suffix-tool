#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/safe-commit.sh" "${1:-}"

echo
read -rp "Commit done. Push now? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Push skipped."
  exit 0
fi

"$SCRIPT_DIR/safe-push.sh"
