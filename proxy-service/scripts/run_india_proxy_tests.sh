#!/usr/bin/env bash
set -euo pipefail

# India-geo proxy tracer runner
# - Verifies proxy geo via myip.lunaproxy.io and ip-api
# - Runs 3 tracer trials strictly through the proxy
# - Writes results to proxy-service/out/
#
# Env overrides (optional):
#   PROXY_USER, PROXY_PASS, PROXY_HOST, PROXY_PORT
#   UA, REQ_TO

PROXY_USER=${PROXY_USER:-user-static_W6isN-region-in-sessid-inv1iziqrfdz5y9o3y-sesstime-90}
PROXY_PASS=${PROXY_PASS:-Test7898}
PROXY_HOST=${PROXY_HOST:-as.lunaproxy.com}
PROXY_PORT=${PROXY_PORT:-12233}
UA=${UA:-"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
REQ_TO=${REQ_TO:-2000}
TARGET_URL=${TARGET_URL:-"https://inspirelabs.gotrackier.com/click?campaign_id=610&pub_id=481"}

WS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$WS_ROOT/out"
SUMMARY="$OUT_DIR/india_proxy_summary.txt"
mkdir -p "$OUT_DIR"

PROXY="http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}"
export PROXY

# Header
{
  echo "=== India Proxy Test ($(date -Iseconds)) ==="
  echo "Proxy: ${PROXY_HOST}:${PROXY_PORT} user=${PROXY_USER}"
} > "$SUMMARY"

# Verify geo via Luna myip
{
  echo "-- myip.lunaproxy.io --"
  curl -s -x "${PROXY_HOST}:${PROXY_PORT}" -U "${PROXY_USER}:${PROXY_PASS}" myip.lunaproxy.io || true
  echo
} >> "$SUMMARY"

# Verify geo via ip-api
{
  echo "-- ip-api.com --"
  curl -s --proxy "$PROXY" "http://ip-api.com/json/?fields=countryCode,query" || true
  echo
} >> "$SUMMARY"

# Trials
for i in 1 2 3; do
  OUT_FILE="$OUT_DIR/html-lite-trace-in-$i.html"
  echo "-- Trial $i --" >> "$SUMMARY"
  UA="$UA" REQ_TO="$REQ_TO" PROXY="$PROXY" "${WS_ROOT}/scripts/run_html_lite_trace.sh" "$TARGET_URL" "$OUT_FILE" | tee -a "$SUMMARY"
  echo >> "$SUMMARY"
  echo "Saved: $OUT_FILE"
done

echo "Summary written to: $SUMMARY"
echo "Done."