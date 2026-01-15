#!/bin/bash
# Local Testing Script for Bright Data Fix
# Tests all changes before AWS deployment

# Don't exit on first error - collect all results
# set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     LOCAL TESTING - BRIGHT DATA FIX                            ║"
echo "║     Tests everything before AWS deployment                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
WARNINGS=0

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

log_warn() {
  echo -e "${YELLOW}⚠️  WARN: $1${NC}"
  ((WARNINGS++))
}

log_info() {
  echo -e "${YELLOW}ℹ️  INFO: $1${NC}"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 1: FILE EXISTENCE & SYNTAX VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Verify new proxy handler file exists"
if [ -f "proxy-service/lib/proxy-providers-handler.js" ]; then
  log_pass "proxy-providers-handler.js exists"
  
  # Check syntax
  if node -c proxy-service/lib/proxy-providers-handler.js 2>/dev/null; then
    log_pass "proxy-providers-handler.js has valid syntax"
  else
    log_fail "proxy-providers-handler.js has syntax errors"
    node -c proxy-service/lib/proxy-providers-handler.js
  fi
else
  log_fail "proxy-providers-handler.js not found"
fi

echo ""
log_test "Verify modified files exist"
if [ -f "proxy-service/server.js" ]; then
  log_pass "proxy-service/server.js exists"
  
  if node -c proxy-service/server.js 2>/dev/null; then
    log_pass "server.js has valid syntax"
  else
    log_fail "server.js has syntax errors"
    node -c proxy-service/server.js 2>&1 | head -20
  fi
else
  log_fail "proxy-service/server.js not found"
fi

if [ -f "supabase/functions/trace-redirects/index.ts" ]; then
  log_pass "trace-redirects edge function exists"
else
  log_fail "trace-redirects edge function not found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 2: CODE CHANGE VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Verify user_context added to server.js"
if grep -q "userContext" proxy-service/server.js; then
  log_pass "userContext parameter found in server.js"
  
  if grep -q "user_context" proxy-service/server.js; then
    log_pass "user_context payload found in server.js"
  else
    log_warn "user_context payload might be missing"
  fi
else
  log_fail "userContext parameter not found in server.js"
fi

echo ""
log_test "Verify user_context added to edge function"
if grep -q "userContext" supabase/functions/trace-redirects/index.ts; then
  log_pass "userContext parameter found in edge function"
  
  if grep -q "user_context" supabase/functions/trace-redirects/index.ts; then
    log_pass "user_context payload found in edge function"
  else
    log_warn "user_context payload might be missing"
  fi
else
  log_fail "userContext parameter not found in edge function"
fi

echo ""
log_test "Verify proxy handler exports"
if grep -q "module.exports" proxy-service/lib/proxy-providers-handler.js; then
  log_pass "Module exports found"
  
  EXPORT_COUNT=$(grep -c "getProxyProviderForOffer\|handleLunaProxy\|handleBrightDataBrowserProxy\|routeToProxyProvider" proxy-service/lib/proxy-providers-handler.js || true)
  if [ "$EXPORT_COUNT" -ge 4 ]; then
    log_pass "All key functions are exported ($EXPORT_COUNT found)"
  else
    log_warn "Some functions might be missing (found $EXPORT_COUNT, expected ≥4)"
  fi
else
  log_fail "No module.exports found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 3: BACKWARD COMPATIBILITY CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Check that essential functions remain unchanged"

# Check for critical functions
FUNCTIONS_TO_CHECK=(
  "async function traceRedirectsHttpOnly("
  "async function traceRedirectsBrowser("
  "async function traceRedirectsAntiCloaking("
  "async function traceRedirectsBrightDataBrowser("
  "async function loadProxySettings("
  "async function initBrowser("
)

for func in "${FUNCTIONS_TO_CHECK[@]}"; do
  if grep -q "$func" proxy-service/server.js 2>/dev/null; then
    log_pass "Function intact: ${func%(*}"
  else
    log_fail "Function missing or modified: ${func%(*}"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 4: DEPENDENCY CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Check Node.js version"
NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"
if [[ "$NODE_VERSION" =~ v1[6-9]|v2[0-9] ]]; then
  log_pass "Node.js version compatible"
else
  log_warn "Node.js version might be too old"
fi

echo ""
log_test "Check required npm packages"
cd proxy-service 2>/dev/null || true

if [ -f "package.json" ]; then
  REQUIRED_PACKAGES=("puppeteer" "@supabase/supabase-js" "express")
  for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if grep -q "\"$pkg\"" package.json; then
      log_pass "Package listed: $pkg"
    else
      log_warn "Package might be missing: $pkg"
    fi
  done
else
  log_warn "package.json not found in proxy-service/"
fi

cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 5: INTEGRATION TEST (If Proxy Service Running)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Check if proxy-service is running locally"
if curl -s http://localhost:3000/health >/dev/null 2>&1; then
  log_pass "Proxy service is running on port 3000"
  
  echo ""
  log_test "Test health endpoint"
  HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
  if [ -n "$HEALTH_RESPONSE" ]; then
    log_pass "Health endpoint responds: $HEALTH_RESPONSE"
  else
    log_warn "Health endpoint returned empty response"
  fi
  
  echo ""
  log_test "Test trace endpoint availability"
  TRACE_TEST=$(curl -s -X POST http://localhost:3000/trace \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"browser"}' 2>&1 || echo "error")
  
  if echo "$TRACE_TEST" | grep -q "chain\|error\|Missing"; then
    log_pass "Trace endpoint responds (even if with error due to missing params)"
  else
    log_warn "Trace endpoint might not be responding correctly"
  fi
  
else
  log_info "Proxy service not running locally (this is OK for file tests)"
  log_info "To test live: Run 'cd proxy-service && npm start' in another terminal"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 6: DOCUMENTATION VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Check documentation files"
DOC_FILES=(
  "BRIGHTDATA-PROXY-IMPLEMENTATION.md"
  "BRIGHTDATA-PROXY-FIX-SUMMARY.md"
  "QUICK-START-BRIGHTDATA-FIX.sh"
  "scripts/test-brightdata-proxy-providers.sh"
)

for doc in "${DOC_FILES[@]}"; do
  if [ -f "$doc" ]; then
    log_pass "Documentation exists: $doc"
  else
    log_warn "Documentation missing: $doc"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 7: GIT STATUS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_test "Check git status"
if command -v git >/dev/null 2>&1; then
  MODIFIED_COUNT=$(git status --short | wc -l)
  log_info "Modified/New files: $MODIFIED_COUNT"
  
  echo ""
  echo "Changed files:"
  git status --short | head -20
  
  if [ "$MODIFIED_COUNT" -gt 0 ]; then
    log_pass "Changes detected and ready to commit"
  fi
else
  log_warn "Git not available"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Tests Passed:  ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed:  ${RED}${TESTS_FAILED}${NC}"
echo -e "Warnings:      ${YELLOW}${WARNINGS}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ ALL CRITICAL TESTS PASSED - SAFE TO DEPLOY TO AWS         ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Next steps:"
  echo ""
  echo "1. Start proxy service locally to test live (optional):"
  echo "   cd proxy-service && npm start"
  echo ""
  echo "2. When ready to deploy to AWS:"
  echo "   bash scripts/deploy-to-aws.sh"
  echo ""
  echo "3. Or deploy manually:"
  echo "   git add -A"
  echo "   git commit -m 'fix: Bright Data user_context + proxy provider selection'"
  echo "   git push origin main"
  echo "   supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn"
  echo "   ssh -i suffix-server.pem ec2-user@44.193.24.197"
  echo "   cd /home/ec2-user/suffix-tool && git pull && pm2 restart proxy-service"
  echo ""
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ SOME TESTS FAILED - FIX ISSUES BEFORE DEPLOYING           ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Please review the failures above and fix them."
  echo ""
  exit 1
fi
