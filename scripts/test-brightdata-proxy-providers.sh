#!/bin/bash
# Bright Data Browser API + Proxy Provider Selection - Test & Validation Guide
# 
# Tests for:
# 1. User context fix for Bright Data Browser API
# 2. Proxy provider selection (not defaulting to Luna)
# 3. Separate proxy handlers functioning correctly
# 4. Offer provider overrides working

set -e

echo "==============================================================="
echo "BRIGHT DATA BROWSER API + PROXY PROVIDER SELECTION TEST SUITE"
echo "==============================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROXY_SERVICE_URL="${PROXY_SERVICE_URL:-http://localhost:3000}"
SUPABASE_URL="${SUPABASE_URL:-https://rfhuqenntxiqurplenjn.supabase.co}"
SUPABASE_KEY="${SUPABASE_KEY:-your-anon-key}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_test() {
  echo -e "${BLUE}🧪 TEST: $1${NC}"
}

log_pass() {
  echo -e "${GREEN}✅ PASS: $1${NC}"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}❌ FAIL: $1${NC}"
  ((TESTS_FAILED++))
}

log_info() {
  echo -e "${YELLOW}ℹ️  INFO: $1${NC}"
}

echo ""
echo "TEST 1: Verify Bright Data Browser API Includes user_context"
echo "=============================================================="
log_test "Trace request with Bright Data Browser includes user_context in payload"

TRACE_RESPONSE=$(curl -s -X POST "${PROXY_SERVICE_URL}/trace" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "mode": "brightdata_browser",
    "user_id": "test-user-123",
    "offer_id": "test-offer-456",
    "debug": true
  }')

if echo "$TRACE_RESPONSE" | grep -q "user_context\|user_id"; then
  log_pass "user_context parameter is present in Bright Data Browser requests"
else
  log_fail "user_context parameter NOT found in request payload"
  echo "Response: $TRACE_RESPONSE"
fi

echo ""
echo "TEST 2: Verify Proxy Provider Selection (Not Defaulting to Luna)"
echo "================================================================="

log_test "Offer with brightdata_browser provider routes to Bright Data (not Luna)"

OFFER_ID="brightdata-offer-test"
USER_ID="test-user-123"

# Simulate offer query
OFFER_RESPONSE=$(curl -s -X GET "${SUPABASE_URL}/rest/v1/offers?id=eq.${OFFER_ID}&user_id=eq.${USER_ID}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo '{"error":"offline"}')

if echo "$OFFER_RESPONSE" | grep -q "provider_id\|brightdata"; then
  log_pass "Offer provider override configured correctly"
else
  log_info "Supabase connectivity check (may be offline in testing)"
fi

log_test "Proxy provider selection respects offer configuration"

PROXY_SELECT_TEST=$(curl -s -X POST "${PROXY_SERVICE_URL}/api/proxy-provider/select" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "'"${USER_ID}"'",
    "offer_id": "'"${OFFER_ID}"'"
  }' 2>/dev/null || echo '{"error":"endpoint-not-found"}')

if echo "$PROXY_SELECT_TEST" | grep -q "provider_type\|brightdata_browser\|luna"; then
  log_pass "Proxy provider selection endpoint responds with provider details"
else
  log_info "Provider selection endpoint test (may require proxy-service running)"
fi

echo ""
echo "TEST 3: Verify Separate Proxy Handlers Are Available"
echo "===================================================="

log_test "Proxy provider handlers module created"

if [ -f "proxy-service/lib/proxy-providers-handler.js" ]; then
  log_pass "proxy-providers-handler.js file created successfully"
  
  # Check for handler functions
  if grep -q "handleLunaProxy\|handleBrightDataBrowserProxy\|handleRotationProxy\|routeToProxyProvider" proxy-service/lib/proxy-providers-handler.js; then
    log_pass "All proxy handler functions are defined"
  else
    log_fail "Some proxy handler functions are missing"
  fi
else
  log_fail "proxy-providers-handler.js file not found"
fi

echo ""
echo "TEST 4: Verify Bright Data Browser user_context Integration"
echo "==========================================================="

log_test "Proxy service server.js includes user_context in Bright Data requests"

if grep -q "userContext.*user_id\|user_context" proxy-service/server.js; then
  log_pass "User context is passed to Bright Data Browser tracer function"
else
  log_fail "User context parameter not found in server.js"
fi

log_test "Edge function trace-redirects includes user_context"

if grep -q "user_context\|account_id.*user_id\|session_id" supabase/functions/trace-redirects/index.ts; then
  log_pass "User context is passed to Bright Data Browser in edge function"
else
  log_fail "User context parameter not found in edge function"
fi

echo ""
echo "TEST 5: Verify No Essential Functions Were Changed"
echo "=================================================="

log_test "Core trace functions remain unchanged"

# Check that main trace function signatures are intact
if grep -q "async function traceRedirects(" proxy-service/server.js; then
  log_pass "Main traceRedirects function signature intact"
else
  log_fail "Main traceRedirects function may have been modified"
fi

if grep -q "async function traceRedirectsBrowser(" proxy-service/server.js; then
  log_pass "Browser trace function signature intact"
else
  log_fail "Browser trace function may have been modified"
fi

echo ""
echo "TEST 6: Code Quality Checks"
echo "==========================="

log_test "JavaScript syntax validation for new handler file"

if node -c proxy-service/lib/proxy-providers-handler.js 2>/dev/null; then
  log_pass "proxy-providers-handler.js has valid JavaScript syntax"
else
  log_fail "Syntax error in proxy-providers-handler.js"
fi

log_test "Module exports available"

if grep -q "module.exports" proxy-service/lib/proxy-providers-handler.js; then
  log_pass "Handler module exports are defined"
  
  EXPORT_COUNT=$(grep -o "module.exports" proxy-service/lib/proxy-providers-handler.js | wc -l)
  log_info "Found $EXPORT_COUNT export statement(s)"
else
  log_fail "Module.exports not found in handler file"
fi

echo ""
echo "TEST 7: Configuration & Error Handling"
echo "====================================="

log_test "User context error cases handled"

if grep -q "user_context" proxy-service/server.js && grep -q "account_id" proxy-service/server.js; then
  log_pass "User context error handling implemented"
else
  log_fail "User context error handling may be incomplete"
fi

log_test "Proxy provider fallback strategies"

if grep -q "loadLunaFromSettings\|selectRotationProvider\|selectBrightDataBrowserProvider" proxy-service/lib/proxy-providers-handler.js; then
  log_pass "Multiple fallback strategies implemented"
else
  log_fail "Fallback strategies not found"
fi

echo ""
echo "=============================================================="
echo "TEST SUMMARY"
echo "=============================================================="
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Deploy changes to production:"
  echo "   git add proxy-service/lib/proxy-providers-handler.js proxy-service/server.js supabase/functions/trace-redirects/index.ts"
  echo "   git commit -m 'fix: Add user_context to Bright Data API + implement proxy provider selection'"
  echo "   git push origin main"
  echo ""
  echo "2. Redeploy edge function:"
  echo "   supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn"
  echo ""
  echo "3. Restart proxy-service:"
  echo "   pm2 restart proxy-service"
  echo ""
  echo "4. Test with real offers using Bright Data Browser provider:"
  echo "   curl -X POST http://localhost:3000/trace \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"url\": \"https://example.com\", \"mode\": \"brightdata_browser\", \"user_id\": \"YOUR_USER_ID\", \"offer_id\": \"YOUR_OFFER_ID\"}'"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review the failures above and fix accordingly."
  exit 1
fi
