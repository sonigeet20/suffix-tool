#!/usr/bin/env bash
set -euo pipefail

# Test webhook with proxy IPs
# This script hits a Trackier URL through proxy and then fires the webhook

PROXY_USER=${PROXY_USER:-user-static_W6isN-region-in-sessid-inv1iziqrfdz5y9o3y-sesstime-90}
PROXY_PASS=${PROXY_PASS:-Test7898}
PROXY_HOST=${PROXY_HOST:-as.lunaproxy.com}
PROXY_PORT=${PROXY_PORT:-12233}

TRACKIER_URL="https://nebula.gotrackier.com/click?campaign_id=400&pub_id=2"
WEBHOOK_URL="https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook"
OFFER_ID="32a76ed2-705f-4ea8-9bcd-3db83cb5f132"
PAIR_INDEX="1"
CAMPAIGN_ID="400"

PROXY="http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}"

echo "==================================="
echo "Testing Trackier Webhook with Proxy"
echo "==================================="
echo ""

# Step 1: Check Trackier URL2 BEFORE webhook
echo "📊 [BEFORE] Fetching current URL2 from Trackier..."
BEFORE_RESPONSE=$(curl -s "https://nebula.gotrackier.com/api/campaigns/399" \
  -H "X-Api-Key: ZWI2NGY1YWEtOTY1Ni00ZTc5LWI5YzMtMDJhYjU1ZDRmNjQ4OjEyMzQ1Njc4")

BEFORE_URL=$(echo "$BEFORE_RESPONSE" | jq -r '.campaign.url // empty')
echo "Current URL2: $BEFORE_URL"
echo ""

# Step 2: Hit Trackier URL through proxy to simulate real click
echo "🌍 [CLICK] Simulating click through India proxy..."
CLICK_ID=$(date +%s)_test
FULL_URL="${TRACKIER_URL}&click_id=${CLICK_ID}"

CLICK_RESPONSE=$(curl -s -L -w "\n%{http_code}" \
  --proxy "$PROXY" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "$FULL_URL" 2>/dev/null | tail -1)

echo "Click simulated with click_id: ${CLICK_ID}"
echo "HTTP Status: $CLICK_RESPONSE"
echo ""

# Step 3: Fire webhook
echo "🔔 [WEBHOOK] Triggering webhook..."
WEBHOOK_RESPONSE=$(curl -s -X POST "${WEBHOOK_URL}?token=${OFFER_ID}&pair_index=${PAIR_INDEX}&campaign_id=${CAMPAIGN_ID}&click_id=${CLICK_ID}")

WEBHOOK_ID=$(echo "$WEBHOOK_RESPONSE" | jq -r '.webhook_id // empty')
echo "Webhook fired: $WEBHOOK_ID"
echo ""

# Step 4: Wait for processing
echo "⏳ Waiting 15 seconds for trace and update..."
sleep 15
echo ""

# Step 5: Check Trackier URL2 AFTER webhook
echo "📊 [AFTER] Fetching updated URL2 from Trackier..."
AFTER_RESPONSE=$(curl -s "https://nebula.gotrackier.com/api/campaigns/399" \
  -H "X-Api-Key: ZWI2NGY1YWEtOTY1Ni00ZTc5LWI5YzMtMDJhYjU1ZDRmNjQ4OjEyMzQ1Njc4")

AFTER_URL=$(echo "$AFTER_RESPONSE" | jq -r '.campaign.url // empty')
echo "Updated URL2: $AFTER_URL"
echo ""

# Step 6: Compare
echo "==================================="
echo "📈 COMPARISON"
echo "==================================="
if [ "$BEFORE_URL" = "$AFTER_URL" ]; then
  echo "❌ URL NOT CHANGED - Trackier cache is preventing updates"
else
  echo "✅ URL CHANGED - Webhook successfully updated Trackier!"
fi
echo ""
echo "Before: $BEFORE_URL"
echo "After:  $AFTER_URL"
echo ""

# Step 7: Check webhook log
echo "📋 Checking webhook log..."
curl -s -G "https://rfhuqenntxiqurplenjn.supabase.co/rest/v1/trackier_webhook_logs" \
  --data-urlencode "select=processed,queued_for_update,trace_duration_ms,update_duration_ms,created_at" \
  --data-urlencode "id=eq.${WEBHOOK_ID}" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8" | jq .

echo ""
echo "✅ Test complete!"
