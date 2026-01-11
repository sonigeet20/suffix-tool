#!/bin/bash
# Test Trackier Macro Update Timing and Cache Behavior

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     TRACKIER MACRO UPDATE TIMING & CACHE TEST                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

API_KEY="6960a7a0d42e87a8434ae67c0ee6960a7a0d4333"
BASE_URL="https://api.trackier.com"
ADVERTISER_ID="3"

# Test values to cycle through
TEST_VALUES=(
  "clickid={clickid}&gclid={gclid}&test=value1"
  "clickid={clickid}&gclid={gclid}&test=value2&extra=param1"
  "clickid={clickid}&gclid={gclid}&test=value3&extra=param2&new=param3"
  "clickid={clickid}&gclid={gclid}&test=value4&final=test"
)

BASE_URL_FINAL="https://hop.easyjet.com/en/holidays?p1=1234"

echo "🚀 Step 1: Creating test campaign..."
echo ""

CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/v2/campaigns" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Cache Test $(date +%s)\",
    \"url\": \"${BASE_URL_FINAL}\",
    \"status\": \"active\",
    \"advertiserId\": ${ADVERTISER_ID},
    \"currency\": \"USD\",
    \"device\": \"all\",
    \"convTracking\": \"iframe_https\",
    \"convTrackingDomain\": \"nebula.gotrackier.com\",
    \"payouts\": [{
      \"currency\": \"USD\",
      \"revenue\": 0,
      \"payout\": 0,
      \"geo\": [\"ALL\"]
    }]
  }")

CAMPAIGN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.campaign.id')
CAMPAIGN_HASH=$(echo "$CREATE_RESPONSE" | jq -r '.campaign.hashId')

if [ -z "$CAMPAIGN_ID" ] || [ "$CAMPAIGN_ID" == "null" ]; then
  echo "❌ Failed to create campaign"
  echo "$CREATE_RESPONSE" | jq .
  exit 1
fi

echo "✓ Campaign created successfully"
echo "  Campaign ID: $CAMPAIGN_ID"
echo "  Hash ID: $CAMPAIGN_HASH"
echo "  Initial URL: $BASE_URL_FINAL"
echo ""

# Function to update campaign and measure time
update_and_check() {
  local iteration=$1
  local new_params=$2
  local new_url="${BASE_URL_FINAL}&${new_params}"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔄 Iteration $iteration: Updating campaign URL..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "New URL: $new_url"
  echo ""
  
  # Record start time
  UPDATE_START=$(date +%s%3N)
  
  # Update the campaign
  UPDATE_RESPONSE=$(curl -s -X PUT "${BASE_URL}/v2/campaigns/${CAMPAIGN_ID}" \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"${new_url}\"
    }")
  
  UPDATE_END=$(date +%s%3N)
  UPDATE_TIME=$((UPDATE_END - UPDATE_START))
  
  if echo "$UPDATE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    echo "✓ Update request successful (${UPDATE_TIME}ms)"
  else
    echo "⚠ Update response:"
    echo "$UPDATE_RESPONSE" | jq .
  fi
  echo ""
  
  # Wait 1 second before fetching
  echo "⏳ Waiting 1 second before fetching..."
  sleep 1
  echo ""
  
  # Fetch the campaign to verify
  echo "📥 Fetching campaign to verify change..."
  FETCH_START=$(date +%s%3N)
  
  FETCH_RESPONSE=$(curl -s -X GET "${BASE_URL}/v2/campaigns/${CAMPAIGN_ID}" \
    -H "X-Api-Key: ${API_KEY}")
  
  FETCH_END=$(date +%s%3N)
  FETCH_TIME=$((FETCH_END - FETCH_START))
  
  CURRENT_URL=$(echo "$FETCH_RESPONSE" | jq -r '.campaign.url')
  
  echo "✓ Fetch completed (${FETCH_TIME}ms)"
  echo ""
  echo "Current URL in Trackier:"
  echo "$CURRENT_URL"
  echo ""
  
  # Check if the URL matches what we sent
  if [ "$CURRENT_URL" == "$new_url" ]; then
    echo "✅ SUCCESS: URL updated in real-time!"
    echo "   Update took: ${UPDATE_TIME}ms"
    echo "   Fetch took: ${FETCH_TIME}ms"
    echo "   Total time: $((UPDATE_TIME + 1000 + FETCH_TIME))ms (including 1s wait)"
    MATCH="YES"
  else
    echo "❌ MISMATCH: URL not updated yet or different"
    echo "   Expected: $new_url"
    echo "   Got: $CURRENT_URL"
    MATCH="NO"
  fi
  echo ""
  
  # Store results
  RESULTS[$iteration]="Iteration $iteration | Update: ${UPDATE_TIME}ms | Fetch: ${FETCH_TIME}ms | Match: $MATCH"
}

# Array to store results
declare -a RESULTS

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                 STARTING SEQUENTIAL UPDATES                      ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Run the test iterations
for i in "${!TEST_VALUES[@]}"; do
  update_and_check $((i+1)) "${TEST_VALUES[$i]}"
  
  # Wait 5 seconds before next iteration (except for the last one)
  if [ $i -lt $((${#TEST_VALUES[@]} - 1)) ]; then
    echo "⏳ Waiting 5 seconds before next update..."
    echo ""
    sleep 5
  fi
done

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                      TEST RESULTS SUMMARY                        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

for result in "${RESULTS[@]}"; do
  echo "$result"
done

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                         CONCLUSIONS                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Count matches
MATCH_COUNT=0
for result in "${RESULTS[@]}"; do
  if echo "$result" | grep -q "Match: YES"; then
    ((MATCH_COUNT++))
  fi
done

TOTAL_ITERATIONS=${#TEST_VALUES[@]}

echo "📊 Statistics:"
echo "   Total updates: $TOTAL_ITERATIONS"
echo "   Successful matches: $MATCH_COUNT"
echo "   Success rate: $((MATCH_COUNT * 100 / TOTAL_ITERATIONS))%"
echo ""

if [ $MATCH_COUNT -eq $TOTAL_ITERATIONS ]; then
  echo "✅ RESULT: No cache delay detected!"
  echo "   All URL updates were reflected immediately (within 1 second)."
  echo "   Trackier API appears to have real-time updates."
else
  echo "⚠️  RESULT: Possible cache delay detected!"
  echo "   $((TOTAL_ITERATIONS - MATCH_COUNT)) out of $TOTAL_ITERATIONS updates did not match immediately."
  echo "   This suggests Trackier may have some caching mechanism."
fi
echo ""

echo "🧹 Cleanup: Campaign ID $CAMPAIGN_ID created for testing"
echo "   You can delete it manually from Trackier dashboard if needed"
echo ""

echo "✨ Test complete!"
