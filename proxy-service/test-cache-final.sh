#!/bin/bash
API_KEY="6960a7a0d42e87a8434ae67c0ee6960a7a0d4333"
CAMPAIGN_ID=300
PUB_ID=2

echo "╔═══════════════════════════════════════════════════════╗"
echo "║     TRACKIER CACHE DELAY TEST - REAL-TIME CHECK      ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "Campaign: https://nebula.gotrackier.com/click?campaign_id=${CAMPAIGN_ID}&pub_id=${PUB_ID}"
echo ""

for i in 1 2 3 4; do
  TIMESTAMP=$(date +"%H:%M:%S")
  echo "[$TIMESTAMP] UPDATE #$i: Setting clickid=value_$i"
  
  # Update campaign URL
  UPDATE=$(curl -s -X POST "https://api.trackier.com/v2/campaigns/${CAMPAIGN_ID}" \
    -H "X-Api-Key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"https://example.com/offer?clickid=value_$i\"}")
  
  SUCCESS=$(echo "$UPDATE" | jq -r '.success')
  echo "  └─ API Response: success=${SUCCESS}"
  
  # Immediate test (< 1 second after update)
  sleep 0.5
  IMMEDIATE=$(curl -L -s -o /dev/null -w "%{url_effective}" "https://nebula.gotrackier.com/click?campaign_id=${CAMPAIGN_ID}&pub_id=${PUB_ID}")
  IMMEDIATE_VALUE=$(echo "$IMMEDIATE" | grep -o 'clickid=[^&]*' | cut -d'=' -f2)
  
  if [ "$IMMEDIATE_VALUE" == "value_$i" ]; then
    echo "  └─ Immediate test (0.5s): ✓ value_$i (UPDATED!)"
  else
    echo "  └─ Immediate test (0.5s): ✗ ${IMMEDIATE_VALUE} (CACHED)"
  fi
  
  # Wait 5 seconds before next update
  if [ $i -lt 4 ]; then
    echo "  └─ Waiting 5 seconds..."
    echo ""
    sleep 5
  fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║               FINAL VERIFICATION (T+20s)              ║"
echo "╚═══════════════════════════════════════════════════════╝"

sleep 1
FINAL=$(curl -L -s -o /dev/null -w "%{url_effective}" "https://nebula.gotrackier.com/click?campaign_id=${CAMPAIGN_ID}&pub_id=${PUB_ID}")
FINAL_VALUE=$(echo "$FINAL" | grep -o 'clickid=[^&]*' | cut -d'=' -f2)

echo "Current redirect: ${FINAL}"
echo "Expected value:   value_4"
echo "Actual value:     ${FINAL_VALUE}"
echo ""

if [ "$FINAL_VALUE" == "value_4" ]; then
  echo "✓ SUCCESS: All updates propagated correctly!"
  echo "  Cache delay: < 1 second"
else
  echo "✗ CACHED: Still showing old value"
  echo "  Cache delay: > 20 seconds"
fi

echo ""
echo "Manual test: https://nebula.gotrackier.com/click?campaign_id=${CAMPAIGN_ID}&pub_id=${PUB_ID}"
echo ""
