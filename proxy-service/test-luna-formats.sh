#!/bin/bash

# Test different Luna proxy geo-targeting formats
# Usage: ./test-luna-formats.sh

PASSWORD="Hamasfake123456789"
BASE_USERNAME="user-admin_X5otK"
HOST="gw-us.lunaproxy.net"
PORT="12233"

echo "Testing Luna Proxy Geo-Targeting Formats..."
echo "============================================"
echo ""

# Test 1: No targeting
echo "🧪 Test 1: No targeting (baseline)"
echo "   Username: $BASE_USERNAME"
curl -x "http://${BASE_USERNAME}:${PASSWORD}@${HOST}:${PORT}" \
     -s https://lumtest.com/myip.json | jq -r '"   Country: \(.country) (\(.country_code))\n   IP: \(.ip)"'
echo ""

# Test 2: Lowercase -region-us
echo "🧪 Test 2: Lowercase -region-us"
echo "   Username: ${BASE_USERNAME}-region-us"
curl -x "http://${BASE_USERNAME}-region-us:${PASSWORD}@${HOST}:${PORT}" \
     -s https://lumtest.com/myip.json | jq -r '"   Country: \(.country) (\(.country_code))\n   IP: \(.ip)"'
echo ""

# Test 3: Uppercase -region-US
echo "🧪 Test 3: Uppercase -region-US"
echo "   Username: ${BASE_USERNAME}-region-US"
curl -x "http://${BASE_USERNAME}-region-US:${PASSWORD}@${HOST}:${PORT}" \
     -s https://lumtest.com/myip.json | jq -r '"   Country: \(.country) (\(.country_code))\n   IP: \(.ip)"'
echo ""

# Test 4: Lowercase -country-us
echo "🧪 Test 4: Lowercase -country-us"
echo "   Username: ${BASE_USERNAME}-country-us"
curl -x "http://${BASE_USERNAME}-country-us:${PASSWORD}@${HOST}:${PORT}" \
     -s https://lumtest.com/myip.json | jq -r '"   Country: \(.country) (\(.country_code))\n   IP: \(.ip)"'
echo ""

# Test 5: Uppercase -country-US
echo "🧪 Test 5: Uppercase -country-US"
echo "   Username: ${BASE_USERNAME}-country-US"
curl -x "http://${BASE_USERNAME}-country-US:${PASSWORD}@${HOST}:${PORT}" \
     -s https://lumtest.com/myip.json | jq -r '"   Country: \(.country) (\(.country_code))\n   IP: \(.ip)"'
echo ""

echo "============================================"
echo "✨ Test complete!"
echo ""
echo "📝 Look for the format that returns 'US' as the country"
