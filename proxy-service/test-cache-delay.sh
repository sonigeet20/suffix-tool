#!/bin/bash
# Trackier Cache Delay Test - Manual Verification

API_KEY="6960a7a0d42e87a8434ae67c0ee6960a7a0d4333"
BASE_URL="https://api.trackier.com"

echo "=== Trackier Cache Delay Test ==="
echo ""

# Step 1: Create a test campaign
echo "1. Creating test campaign..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/v2/campaigns" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Cache Test Campaign",
    "url": "https://example.com/test?clickid=initial_value",
    "status": "active",
    "advertiserId": 3,
    "currency": "USD",
    "device": "all",
    "convTracking": "iframe_https",
    "convTrackingDomain": "nebula.gotrackier.com",
    "payouts": [{
      "currency": "USD",
      "revenue": 0,
      "payout": 0,
      "geo": ["ALL"]
    }]
  }')

CAMPAIGN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.campaign.id')
TRACKING_LINK="https://nebula.gotrackier.com/click?campaign_id=${CAMPAIGN_ID}"

echo "✓ Created campaign ID: $CAMPAIGN_ID"
echo "  Tracking link: $TRACKING_LINK"
echo ""

# Function to update campaign URL
update_campaign() {
  local NEW_VALUE=$1
  echo "[$2] Updating campaign with clickid=${NEW_VALUE}..."
  
  UPDATE_RESPONSE=$(curl -s -X PUT "${BASE_URL}/v2/campaigns/${CAMPAIGN_ID}" \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"https://example.com/test?clickid=${NEW_VALUE}\"
    }")
  
  UPDATE_STATUS=$(echo "$UPDATE_RESPONSE" | jq -r '.success // "unknown"')
  echo "  API Response: ${UPDATE_STATUS}"
  
  # Immediately test the actual redirect
  echo "  Testing actual redirect..."
  ACTUAL_REDIRECT=$(curl -s -I "${TRACKING_LINK}" 2>&1 | grep -i "location:" | head -1 | cut -d' ' -f2 | tr -d '\r')
  
  if echo "$ACTUAL_REDIRECT" | grep -q "${NEW_VALUE}"; then
    echo "  ✓ Redirect shows: clickid=${NEW_VALUE} (UPDATED!)"
  else
    CURRENT_VALUE=$(echo "$ACTUAL_REDIRECT" | grep -o 'clickid=[^&]*' | cut -d'=' -f2)
    echo "  ✗ Redirect shows: clickid=${CURRENT_VALUE} (CACHED/OLD VALUE)"
  fi
  echo ""
}

# Test sequence with 5 second delays
echo "2. Running update tests (5 second intervals)..."
echo ""

update_campaign "test_value_1" "T+0s"
sleep 5

update_campaign "test_value_2" "T+5s"
sleep 5

update_campaign "test_value_3" "T+10s"
sleep 5

update_campaign "test_value_4" "T+15s"
sleep 5

echo "3. Final verification after 20 seconds..."
FINAL_REDIRECT=$(curl -s -I "${TRACKING_LINK}" 2>&1 | grep -i "location:" | head -1 | cut -d' ' -f2 | tr -d '\r')
FINAL_VALUE=$(echo "$FINAL_REDIRECT" | grep -o 'clickid=[^&]*' | cut -d'=' -f2)

echo "  Final redirect value: clickid=${FINAL_VALUE}"
echo "  Expected value: test_value_4"

if [ "$FINAL_VALUE" == "test_value_4" ]; then
  echo "  ✓ Cache cleared, showing latest value"
else
  echo "  ✗ Still showing cached value (cache TTL > 20s)"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "Summary:"
echo "  Campaign ID: $CAMPAIGN_ID"
echo "  Tracking Link: $TRACKING_LINK"
echo "  Cache Behavior: Check output above"
echo ""
echo "To manually verify, visit: $TRACKING_LINK"
echo ""
