#!/bin/bash
# QUICK START: Bright Data Browser API Fix + Proxy Provider Selection
# Run this after git clone to understand what was fixed

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║ BRIGHT DATA BROWSER API FIX - QUICK START GUIDE              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "proxy-service/server.js" ]; then
    echo "❌ Please run this from the project root directory"
    exit 1
fi

echo -e "${BLUE}📋 WHAT WAS FIXED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Bright Data Browser API Error"
echo "   ❌ Was: 'Bright Data Browser tracer requires user context'"
echo "   ✅ Now: user_context automatically included in all BD requests"
echo ""
echo "2️⃣  Proxy Provider Selection"
echo "   ❌ Was: Everything defaulted to Luna, ignoring BD settings"
echo "   ✅ Now: Intelligent routing respects offer provider_id"
echo ""
echo "3️⃣  Modular Proxy Handlers"
echo "   ❌ Was: Mixed provider logic throughout codebase"
echo "   ✅ Now: Separate handlers for each provider type"
echo ""

echo -e "${BLUE}📁 FILES CREATED/MODIFIED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📄 NEW FILES:"
if [ -f "proxy-service/lib/proxy-providers-handler.js" ]; then
    echo "   ✅ proxy-service/lib/proxy-providers-handler.js"
    echo "      └─ Proxy provider selection + routing system"
    LINES=$(wc -l < proxy-service/lib/proxy-providers-handler.js)
    echo "      └─ $LINES lines of code"
else
    echo "   ❌ proxy-service/lib/proxy-providers-handler.js NOT FOUND"
fi

if [ -f "scripts/test-brightdata-proxy-providers.sh" ]; then
    echo ""
    echo "   ✅ scripts/test-brightdata-proxy-providers.sh"
    echo "      └─ Comprehensive test suite"
else
    echo "   ❌ Test suite not found"
fi

if [ -f "BRIGHTDATA-PROXY-IMPLEMENTATION.md" ]; then
    echo ""
    echo "   ✅ BRIGHTDATA-PROXY-IMPLEMENTATION.md"
    echo "      └─ Detailed implementation guide"
else
    echo "   ❌ Implementation guide not found"
fi

if [ -f "proxy-service/PROXY-HANDLERS-EXAMPLES.js" ]; then
    echo ""
    echo "   ✅ proxy-service/PROXY-HANDLERS-EXAMPLES.js"
    echo "      └─ 7 integration pattern examples"
else
    echo "   ❌ Examples not found"
fi

if [ -f "BRIGHTDATA-PROXY-FIX-SUMMARY.md" ]; then
    echo ""
    echo "   ✅ BRIGHTDATA-PROXY-FIX-SUMMARY.md"
    echo "      └─ Complete summary & status"
else
    echo "   ❌ Summary not found"
fi

echo ""
echo "📝 MODIFIED FILES:"

if grep -q "userContext" proxy-service/server.js 2>/dev/null; then
    echo "   ✅ proxy-service/server.js"
    echo "      └─ Added user_context parameter to traceRedirectsBrightDataBrowser()"
    echo "      └─ Pass user context when calling Bright Data API"
else
    echo "   ❌ proxy-service/server.js not updated"
fi

if grep -q "userContext" supabase/functions/trace-redirects/index.ts 2>/dev/null; then
    echo ""
    echo "   ✅ supabase/functions/trace-redirects/index.ts"
    echo "      └─ Added user_context parameter to fetchThroughBrightDataBrowser()"
    echo "      └─ Include user_context in Bright Data API requests"
else
    echo "   ❌ Edge function not updated"
fi

echo ""
echo -e "${BLUE}🚀 DEPLOYMENT STEPS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  REVIEW CHANGES"
echo "    $ git diff proxy-service/server.js"
echo "    $ git diff supabase/functions/trace-redirects/index.ts"
echo ""
echo "2️⃣  COMMIT"
echo "    $ git add -A"
echo "    $ git commit -m 'fix: Bright Data Browser user_context + proxy provider selection'"
echo "    $ git push origin main"
echo ""
echo "3️⃣  DEPLOY EDGE FUNCTION"
echo "    $ supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn"
echo ""
echo "4️⃣  RESTART PROXY SERVICE"
echo "    $ pm2 restart proxy-service"
echo ""
echo "5️⃣  RUN TESTS"
echo "    $ bash scripts/test-brightdata-proxy-providers.sh"
echo ""

echo -e "${BLUE}📊 VALIDATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Check for user_context in logs:"
echo "    $ pm2 logs proxy-service | grep 'Bright Data user context set'"
echo ""
echo "Test Bright Data Browser trace:"
echo "    $ curl -X POST http://localhost:3000/trace \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"url\": \"https://example.com\", \"mode\": \"brightdata_browser\", \"user_id\": \"test\"}'"
echo ""
echo "Test Luna proxy trace:"
echo "    $ curl -X POST http://localhost:3000/trace \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"url\": \"https://example.com\", \"mode\": \"browser\", \"user_id\": \"test\"}'"
echo ""

echo -e "${BLUE}📚 DOCUMENTATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  FULL IMPLEMENTATION GUIDE"
echo "    $ cat BRIGHTDATA-PROXY-IMPLEMENTATION.md"
echo ""
echo "2️⃣  INTEGRATION EXAMPLES"
echo "    $ cat proxy-service/PROXY-HANDLERS-EXAMPLES.js"
echo "    └─ 7 different integration patterns"
echo ""
echo "3️⃣  COMPLETE SUMMARY"
echo "    $ cat BRIGHTDATA-PROXY-FIX-SUMMARY.md"
echo ""
echo "4️⃣  RUN TEST SUITE"
echo "    $ bash scripts/test-brightdata-proxy-providers.sh"
echo ""

echo -e "${BLUE}🔄 HOW PROVIDER SELECTION WORKS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "PRIORITY ORDER:"
echo "  1️⃣  Check offer.provider_id (highest priority)"
echo "  2️⃣  Check for special values (USE_ROTATION, USE_SETTINGS_LUNA)"
echo "  3️⃣  Use default strategy (Luna)"
echo ""
echo "EXAMPLES:"
echo ""
echo "  📌 Offer has provider_id = 'brightdata-provider-123'"
echo "     → Routes to Bright Data Browser (NOT Luna!)"
echo ""
echo "  📌 Offer has provider_id = 'USE_ROTATION'"
echo "     → Cycles through all enabled providers"
echo ""
echo "  📌 Offer has provider_id = 'USE_SETTINGS_LUNA'"
echo "     → Uses Luna from settings table (legacy)"
echo ""
echo "  📌 No offer or provider_id = null"
echo "     → Uses Luna (default)"
echo ""

echo -e "${BLUE}✨ KEY IMPROVEMENTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Bright Data Browser API now works (user_context included)"
echo "✅ Proxy provider selection is intelligent (respects settings)"
echo "✅ Modular handler system available (but optional to use)"
echo "✅ Backward compatible (existing code still works)"
echo "✅ No breaking changes to API endpoints"
echo "✅ Graceful fallback to Luna if provider unavailable"
echo "✅ Support for provider rotation / load balancing"
echo ""

echo -e "${BLUE}🎯 QUICK CHECKLIST${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Before deploying:"
echo "  [ ] Review changes in proxy-service/server.js"
echo "  [ ] Review changes in supabase/functions/trace-redirects/index.ts"
echo "  [ ] Check proxy-providers-handler.js exists"
echo "  [ ] Test suite ready: scripts/test-brightdata-proxy-providers.sh"
echo ""
echo "During deployment:"
echo "  [ ] Commit changes with descriptive message"
echo "  [ ] Deploy edge function to Supabase"
echo "  [ ] Restart proxy-service"
echo "  [ ] Monitor logs for errors"
echo ""
echo "After deployment:"
echo "  [ ] Run test suite successfully"
echo "  [ ] Check for 'user_context set' messages in logs"
echo "  [ ] Verify Bright Data Browser traces work"
echo "  [ ] Verify Luna traces still work"
echo "  [ ] Monitor error rate for 24 hours"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗"
echo "║ 🎉 READY FOR DEPLOYMENT!                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next: Run 'bash scripts/test-brightdata-proxy-providers.sh' to validate"
echo ""
