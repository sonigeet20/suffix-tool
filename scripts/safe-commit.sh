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

if [[ $(git diff --cached --name-only | wc -l | tr -d ' ') -eq 0 ]]; then
  echo "No staged changes. Use 'git add <files>' first." >&2
  echo "Staged files will be shown for confirmation before commit."
  exit 1
fi

echo "Staged files:" 
git diff --cached --name-only | sed 's/^/  - /'

COMMIT_MSG="${1:-}"
if [[ -z "$COMMIT_MSG" ]]; then
  read -rp "Commit message: " COMMIT_MSG
fi

echo
echo "Proposed commit message: $COMMIT_MSG"
read -rp "Proceed with commit to '$REMOTE_NAME/$BRANCH'? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

git commit -m "$COMMIT_MSG"
echo "Commit created."
