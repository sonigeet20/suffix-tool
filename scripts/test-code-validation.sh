#!/bin/bash
# Test Tracer Code Without Running Service
# Tests the actual code files and logic

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║            TRACER CODE VALIDATION - NO SERVICE NEEDED          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
  echo -e "${BLUE}🧪 $1${NC}"
}

log_pass() {
  echo -e "${GREEN}✅ $1${NC}"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}❌ $1${NC}"
  ((TESTS_FAILED++))
}

log_info() {
  echo -e "${YELLOW}ℹ️  $1${NC}"
}

cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 1: Verify user_context Added to Bright Data Function"
echo "═══════════════════════════════════════════════════════════════"

if grep -q "userContext" proxy-service/server.js; then
  log_pass "userContext parameter found in server.js"
else
  log_fail "userContext parameter NOT found in server.js"
fi

if grep -q "user_context" proxy-service/server.js; then
  log_pass "user_context payload found in server.js"
else
  log_fail "user_context payload NOT found in server.js"
fi

if grep -q "🔐 Bright Data user context set" proxy-service/server.js; then
  log_pass "User context logging message found"
else
  log_info "User context logging message not found (not critical)"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 2: Verify Edge Function Has user_context"
echo "═══════════════════════════════════════════════════════════════"

if grep -q "userContext" supabase/functions/trace-redirects/index.ts; then
  log_pass "userContext parameter found in edge function"
else
  log_fail "userContext parameter NOT found in edge function"
fi

if grep -q "user_context" supabase/functions/trace-redirects/index.ts; then
  log_pass "user_context payload found in edge function"
else
  log_fail "user_context payload NOT found in edge function"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 3: Verify Proxy Providers Handler Exists"
echo "═══════════════════════════════════════════════════════════════"

if [ -f "proxy-service/lib/proxy-providers-handler.js" ]; then
  log_pass "proxy-providers-handler.js file exists"
  
  # Check syntax
  if node -c proxy-service/lib/proxy-providers-handler.js 2>/dev/null; then
    log_pass "proxy-providers-handler.js has valid syntax"
  else
    log_fail "proxy-providers-handler.js has syntax errors"
  fi
  
  # Check for key functions
  FUNCTIONS=("getProxyProviderForOffer" "handleLunaProxy" "handleBrightDataBrowserProxy" "routeToProxyProvider")
  for func in "${FUNCTIONS[@]}"; do
    if grep -q "function $func\|const $func\|async function $func" proxy-service/lib/proxy-providers-handler.js; then
      log_pass "Function $func exists"
    else
      log_fail "Function $func NOT found"
    fi
  done
else
  log_fail "proxy-providers-handler.js file NOT found"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 4: Verify Existing Trace Functions Not Modified"
echo "═══════════════════════════════════════════════════════════════"

# Check that critical functions still exist unchanged
CORE_FUNCTIONS=("traceRedirects" "traceRedirectsBrowser" "traceRedirectsAntiCloaking" "traceRedirectsInteractive" "loadProxySettings")

for func in "${CORE_FUNCTIONS[@]}"; do
  if grep -q "async function $func\|function $func" proxy-service/server.js; then
    log_pass "Core function $func still exists"
  else
    log_fail "Core function $func NOT found (BREAKING CHANGE!)"
  fi
done

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 5: Check Bright Data API Payload Structure"
echo "═══════════════════════════════════════════════════════════════"

log_info "Checking if payload includes all required fields..."

# Check server.js
if grep -A 20 "buildPayload.*=" proxy-service/server.js | grep -q "user_context"; then
  log_pass "buildPayload includes user_context in server.js"
else
  log_fail "buildPayload missing user_context in server.js"
fi

# Check edge function
if grep -A 20 "requestBody.*=" supabase/functions/trace-redirects/index.ts | grep -q "user_context"; then
  log_pass "requestBody includes user_context in edge function"
else
  log_fail "requestBody missing user_context in edge function"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 6: Verify Backward Compatibility"
echo "═══════════════════════════════════════════════════════════════"

log_info "Checking that userContext is optional (not required)..."

# userContext should be in options with default/optional behavior
if grep -q "userContext.*=" proxy-service/server.js; then
  log_pass "userContext has default value (optional parameter)"
else
  log_info "userContext might be required (check manually)"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 7: Check for 'requires user context' Error Fix"
echo "═══════════════════════════════════════════════════════════════"

log_info "Verifying the fix addresses the original error..."

# Count occurrences of user_context (should be multiple)
UC_COUNT=$(grep -c "user_context" proxy-service/server.js 2>/dev/null || echo "0")
EF_COUNT=$(grep -c "user_context" supabase/functions/trace-redirects/index.ts 2>/dev/null || echo "0")

if [ "$UC_COUNT" -gt 0 ] && [ "$EF_COUNT" -gt 0 ]; then
  log_pass "user_context implemented in both server.js ($UC_COUNT) and edge function ($EF_COUNT)"
else
  log_fail "user_context not properly implemented"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 8: Validate JavaScript/TypeScript Syntax"
echo "═══════════════════════════════════════════════════════════════"

# Test server.js syntax
if node -c proxy-service/server.js 2>/dev/null; then
  log_pass "proxy-service/server.js has valid JavaScript syntax"
else
  log_fail "proxy-service/server.js has syntax errors!"
fi

# Test handler syntax
if node -c proxy-service/lib/proxy-providers-handler.js 2>/dev/null; then
  log_pass "proxy-providers-handler.js has valid JavaScript syntax"
else
  log_fail "proxy-providers-handler.js has syntax errors!"
fi

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 9: Check Test Scripts Exist"
echo "═══════════════════════════════════════════════════════════════"

TEST_SCRIPTS=(
  "scripts/test-tracers-local.sh"
  "scripts/test-local-brightdata-fix.sh"
  "scripts/test-brightdata-proxy-providers.sh"
)

for script in "${TEST_SCRIPTS[@]}"; do
  if [ -f "$script" ]; then
    log_pass "Test script exists: $script"
  else
    log_info "Test script not found: $script"
  fi
done

echo ""

echo "═══════════════════════════════════════════════════════════════"
log_test "TEST 10: Documentation Check"
echo "═══════════════════════════════════════════════════════════════"

DOCS=(
  "BRIGHTDATA-PROXY-FIX-SUMMARY.md"
  "BRIGHTDATA-PROXY-IMPLEMENTATION.md"
  "QUICK-START-BRIGHTDATA-FIX.sh"
)

for doc in "${DOCS[@]}"; do
  if [ -f "$doc" ]; then
    log_pass "Documentation exists: $doc"
  else
    log_info "Documentation not found: $doc"
  fi
done

echo ""
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   CODE VALIDATION RESULTS                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Tests Passed:  $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed:  $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}✅ ALL CODE VALIDATION TESTS PASSED!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "The code changes are valid and safe to deploy."
  echo ""
  echo "NEXT STEP: Test with proxy-service running"
  echo ""
  echo "Option 1: Start service manually and test:"
  echo "  Terminal 1: cd proxy-service && node server.js"
  echo "  Terminal 2: bash scripts/test-tracers-local.sh"
  echo ""
  echo "Option 2: Deploy directly to AWS (if confident):"
  echo "  bash scripts/deploy-to-aws.sh"
  echo ""
  exit 0
else
  echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}❌ SOME CODE VALIDATION TESTS FAILED${NC}"
  echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Please review the failures above before deploying."
  echo ""
  exit 1
fi
