#!/usr/bin/env bash
set -euo pipefail

# Quick runner for HTML Lite Trace
# Usage:
#   PROXY="http://user:pass@host:port" ./scripts/run_html_lite_trace.sh "https://example.com" /tmp/trace.html

URL="${1:-}"
OUT="${2:-/tmp/html-lite-trace.html}"
MAXHOPS="${MAXHOPS:-10}"
REQ_TO="${REQ_TO:-1500}"

if [[ -z "$URL" ]]; then
  echo "Usage: PROXY=http://user:pass@host:port $0 <url> [out.html]"
  exit 1
fi

echo "Running HTML Lite Trace..."
ARGS=( --url "$URL" --maxHops "$MAXHOPS" --out "$OUT" --requestTimeout "$REQ_TO" )
if [[ -n "${PROXY:-}" ]]; then ARGS+=( --proxy "$PROXY" ); fi
if [[ -n "${UA:-}" ]]; then ARGS+=( --ua "$UA" ); fi
time node ./scripts/html_lite_trace.js "${ARGS[@]}"
echo "Open: $OUT"
