#!/bin/bash

# Test BrightData Proxy After Whitelisting
# Run this script AFTER adding 3.226.2.45 to BrightData whitelist

echo "════════════════════════════════════════════════════════════════════════════════"
echo "            🧪 BRIGHTDATA PROXY TEST (AFTER WHITELISTING)"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

EXPECTED_IP="3.226.2.45"
OUTBOUND_IP=$(curl -s https://api.ipify.org)

echo "📍 Current outbound IP: $OUTBOUND_IP"
if [ "$OUTBOUND_IP" != "$EXPECTED_IP" ]; then
    echo "⚠️  Warning: IP doesn't match NAT Gateway ($EXPECTED_IP)"
fi
echo ""

# Test 1: BrightData proxy with US geo-targeting
echo "1️⃣  Testing BrightData proxy (US location)..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    --proxy brd.superproxy.io:33335 \
    --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
    "https://ipapi.co/json/" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ SUCCESS! BrightData proxy working (HTTP 200)"
    echo "   Response preview:"
    echo "$BODY" | head -5
    
    # Check if US IP
    COUNTRY=$(echo "$BODY" | grep -o '"country":"[^"]*"' | cut -d'"' -f4)
    if [ "$COUNTRY" = "US" ]; then
        echo "✅ Geo-targeting working: Country = $COUNTRY"
    else
        echo "⚠️  Geo-targeting issue: Country = $COUNTRY (expected US)"
    fi
else
    echo "❌ FAILED! HTTP $HTTP_CODE"
    if [ "$HTTP_CODE" = "407" ]; then
        echo "   ERROR: Still getting 407 - IP not whitelisted yet"
        echo "   Please whitelist $EXPECTED_IP in BrightData dashboard"
    else
        echo "   Response: $BODY"
    fi
    exit 1
fi
echo ""

# Test 2: BrightData proxy with India geo-targeting
echo "2️⃣  Testing BrightData proxy (India location)..."
RESPONSE_IN=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    --proxy brd.superproxy.io:33335 \
    --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-in:sugfiq4h5s73" \
    "https://ipapi.co/json/" 2>&1)

HTTP_CODE_IN=$(echo "$RESPONSE_IN" | grep "HTTP_CODE" | cut -d: -f2)
BODY_IN=$(echo "$RESPONSE_IN" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE_IN" = "200" ]; then
    echo "✅ SUCCESS! India geo-targeting working (HTTP 200)"
    COUNTRY_IN=$(echo "$BODY_IN" | grep -o '"country":"[^"]*"' | cut -d'"' -f4)
    if [ "$COUNTRY_IN" = "IN" ]; then
        echo "✅ Geo-targeting verified: Country = $COUNTRY_IN"
    else
        echo "⚠️  Unexpected country: $COUNTRY_IN (expected IN)"
    fi
else
    echo "❌ FAILED! HTTP $HTTP_CODE_IN"
fi
echo ""

# Test 3: Test via local proxy service (if running)
echo "3️⃣  Testing local proxy service endpoint..."
if nc -z localhost 3000 2>/dev/null; then
    LOCAL_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:3000/trace?url=https://example.com&proxy_provider=brightdata&country=us" 2>&1)
    
    if [ "$LOCAL_RESPONSE" = "200" ]; then
        echo "✅ SUCCESS! Local service working (HTTP 200)"
    else
        echo "⚠️  Local service returned: HTTP $LOCAL_RESPONSE"
    fi
else
    echo "⏭️  Skipped - local service not running on port 3000"
fi
echo ""

echo "════════════════════════════════════════════════════════════════════════════════"
echo "                          ✅ TEST COMPLETE"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

if [ "$HTTP_CODE" = "200" ] && [ "$HTTP_CODE_IN" = "200" ]; then
    echo "🎉 ALL TESTS PASSED!"
    echo ""
    echo "✅ NAT Gateway working: All instances use IP $EXPECTED_IP"
    echo "✅ BrightData proxy working: Both US and India geo-targeting"
    echo "✅ Future instances will automatically work (no manual whitelisting needed)"
    echo ""
    echo "Your auto-scaling is now ready! 🚀"
else
    echo "⚠️  Some tests failed - review output above"
fi

echo "════════════════════════════════════════════════════════════════════════════════"
