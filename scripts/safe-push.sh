#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT_DIR" ]]; then
  echo "Not inside a git repository." >&2
  exit 1
fi
cd "$ROOT_DIR"

REMOTE_NAME="origin"
REMOTE_URL="$(git remote get-url "$REMOTE_NAME" 2>/dev/null || echo "(no remote)")"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Repo: $REMOTE_NAME → $REMOTE_URL"
echo "Branch: $BRANCH"

echo
echo "Status (ahead/behind):"
git status -sb || true

echo
echo "Last commit:"
git --no-pager log -1 --pretty=oneline

read -rp "Push current branch to '$REMOTE_NAME/$BRANCH'? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

git push "$REMOTE_NAME" "$BRANCH"
echo "Pushed to $REMOTE_NAME/$BRANCH."
