#!/bin/bash

# Test Parallel Tracing System
# This script simulates multiple concurrent Google Ad clicks

SUPABASE_URL="${VITE_SUPABASE_URL}"
OFFER_NAME="test-offer"
CONCURRENT_REQUESTS=10

echo "🧪 Testing Parallel Tracing System"
echo "===================================="
echo ""
echo "Configuration:"
echo "  Supabase URL: $SUPABASE_URL"
echo "  Offer: $OFFER_NAME"
echo "  Concurrent Requests: $CONCURRENT_REQUESTS"
echo ""

# Check if offer exists
echo "🔍 Checking if offer exists..."
OFFER_CHECK=$(curl -s "${SUPABASE_URL}/functions/v1/track-hit?offer=${OFFER_NAME}" | grep -c "not found")

if [ "$OFFER_CHECK" -gt 0 ]; then
  echo "❌ Offer '${OFFER_NAME}' not found. Please create it first."
  exit 1
fi

echo "✅ Offer found"
echo ""

# Test 1: Single request
echo "📝 Test 1: Single Request"
echo "-------------------------"
START_TIME=$(date +%s)
RESPONSE=$(curl -s -w "\n%{http_code}" "${SUPABASE_URL}/functions/v1/track-hit?offer=${OFFER_NAME}&gclid=test-single")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Single request successful (${DURATION}s)"
else
  echo "❌ Single request failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Concurrent requests
echo "📝 Test 2: ${CONCURRENT_REQUESTS} Concurrent Requests"
echo "-------------------------"
START_TIME=$(date +%s)

# Launch concurrent requests
for i in $(seq 1 $CONCURRENT_REQUESTS); do
  (
    curl -s "${SUPABASE_URL}/functions/v1/track-hit?offer=${OFFER_NAME}&gclid=test-concurrent-${i}" > /dev/null 2>&1
    echo "  ✓ Request $i completed"
  ) &
done

# Wait for all requests to complete
wait

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "✅ All concurrent requests completed in ${DURATION}s"
echo ""

# Test 3: Check pool status
echo "📝 Test 3: IP Pool Status"
echo "-------------------------"
curl -s "${SUPABASE_URL}/functions/v1/ip-pool-maintenance" | jq '.'
echo ""

echo "🎉 Parallel tracing test complete!"
echo ""
echo "💡 Next Steps:"
echo "  1. Check active_trace_requests table for results"
echo "  2. Monitor ip_pool_statistics for utilization"
echo "  3. Review url_traces for tracking data"
echo ""
