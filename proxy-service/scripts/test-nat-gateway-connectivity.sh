#!/bin/bash

# Test NAT Gateway Connectivity from EC2 Instance
# Run this script on any EC2 instance to verify NAT Gateway is working

echo "════════════════════════════════════════════════════════════════════════════════"
echo "                  🧪 NAT GATEWAY CONNECTIVITY TEST"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Test 1: Check outbound IP
echo "1️⃣  Checking outbound IP address..."
OUTBOUND_IP=$(curl -s https://api.ipify.org)
EXPECTED_IP="3.226.2.45"

if [ "$OUTBOUND_IP" = "$EXPECTED_IP" ]; then
    echo "✅ SUCCESS! Outbound IP: $OUTBOUND_IP (matches NAT Gateway Elastic IP)"
else
    echo "❌ FAILED! Outbound IP: $OUTBOUND_IP (expected: $EXPECTED_IP)"
    echo "   NAT Gateway may not be configured correctly"
    exit 1
fi
echo ""

# Test 2: Internet connectivity
echo "2️⃣  Testing internet connectivity..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://www.google.com)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
    echo "✅ SUCCESS! Internet connectivity works (HTTP $HTTP_CODE)"
else
    echo "❌ FAILED! Cannot reach internet (HTTP $HTTP_CODE)"
    exit 1
fi
echo ""

# Test 3: BrightData proxy (should get 407 before whitelisting)
echo "3️⃣  Testing BrightData proxy connection..."
echo "   (Should get 407 - IP not whitelisted yet)"
PROXY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    --proxy brd.superproxy.io:33335 \
    --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
    "https://ipapi.co/json/" 2>&1)

if [ "$PROXY_RESPONSE" = "407" ]; then
    echo "✅ EXPECTED! Proxy returns 407 (IP not whitelisted yet)"
    echo "   This is normal before whitelisting in BrightData"
elif [ "$PROXY_RESPONSE" = "200" ]; then
    echo "✅ SUCCESS! Proxy already working (IP already whitelisted)"
else
    echo "⚠️  Proxy returned: $PROXY_RESPONSE"
    echo "   Check BrightData credentials if this persists after whitelisting"
fi
echo ""

echo "════════════════════════════════════════════════════════════════════════════════"
echo "                          ✅ TEST RESULTS"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Outbound IP: $OUTBOUND_IP"
echo "Expected IP: $EXPECTED_IP"
echo "Internet: Working"
echo "Proxy Status: $PROXY_RESPONSE"
echo ""

if [ "$OUTBOUND_IP" = "$EXPECTED_IP" ]; then
    echo "🎯 NAT Gateway is configured correctly!"
    echo ""
    echo "📋 NEXT STEP: Whitelist this IP in BrightData"
    echo "   1. Go to: https://brightdata.com/cp/zones"
    echo "   2. Select zone: testing_softality_1"
    echo "   3. Go to 'Zone Settings' → 'IP Whitelist'"
    echo "   4. Add IP: $EXPECTED_IP"
    echo "   5. Save changes"
    echo ""
    echo "Then run: ./test-brightdata-after-whitelist.sh"
else
    echo "❌ NAT Gateway configuration issue - contact support"
fi

echo "════════════════════════════════════════════════════════════════════════════════"
