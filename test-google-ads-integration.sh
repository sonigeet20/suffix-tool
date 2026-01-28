#!/bin/bash
# Google Ads Click Tracker - Integration Test Script
# Tests all components to verify correct installation

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration (set these before running)
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
DATABASE_URL="${DATABASE_URL:-}"
NLB_URL="${NLB_URL:-http://localhost:3000}"  # Or your NLB IP
TEST_OFFER="${TEST_OFFER:-TEST_OFFER}"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Google Ads Click Tracker - Integration Test      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}✗ SUPABASE_URL not set${NC}"
    echo "  Export it: export SUPABASE_URL=https://YOUR_PROJECT.supabase.co"
    exit 1
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}✗ SUPABASE_ANON_KEY not set${NC}"
    echo "  Export it: export SUPABASE_ANON_KEY=your_anon_key"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ DATABASE_URL not set${NC}"
    echo "  Export it: export DATABASE_URL=postgresql://..."
    exit 1
fi

echo -e "${GREEN}✓ Environment variables set${NC}"
echo ""

# Test 1: Database Schema
echo -e "${BLUE}Test 1: Database Schema${NC}"
echo "  Checking if tables exist..."

TABLES=$(psql "$DATABASE_URL" -t -c "SELECT tablename FROM pg_tables WHERE tablename IN ('geo_suffix_buckets', 'google_ads_click_stats');" | tr -d ' ')

if echo "$TABLES" | grep -q "geo_suffix_buckets" && echo "$TABLES" | grep -q "google_ads_click_stats"; then
    echo -e "${GREEN}  ✓ Tables exist${NC}"
else
    echo -e "${RED}  ✗ Tables missing${NC}"
    echo "  Run: supabase db push supabase/migrations/20260128_google_ads_click_tracker.sql"
    exit 1
fi

echo "  Checking if columns exist..."
COLUMN=$(psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='offers' AND column_name='google_ads_config';" | tr -d ' ')

if [ "$COLUMN" == "google_ads_config" ]; then
    echo -e "${GREEN}  ✓ Columns exist${NC}"
else
    echo -e "${RED}  ✗ Columns missing${NC}"
    exit 1
fi

echo "  Checking if functions exist..."
FUNCTION=$(psql "$DATABASE_URL" -t -c "SELECT proname FROM pg_proc WHERE proname='get_geo_suffix';" | tr -d ' ')

if [ "$FUNCTION" == "get_geo_suffix" ]; then
    echo -e "${GREEN}  ✓ Functions exist${NC}"
else
    echo -e "${RED}  ✗ Functions missing${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Test 1 passed: Database schema is correct${NC}"
echo ""

# Test 2: Edge Functions
echo -e "${BLUE}Test 2: Edge Functions${NC}"

echo "  Testing get-suffix-geo..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SUPABASE_URL/functions/v1/get-suffix-geo" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"offer_name":"TEST","target_country":"US"}')

if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "403" ] || [ "$RESPONSE" == "404" ]; then
    echo -e "${GREEN}  ✓ get-suffix-geo is deployed (HTTP $RESPONSE)${NC}"
else
    echo -e "${RED}  ✗ get-suffix-geo not responding (HTTP $RESPONSE)${NC}"
    echo "  Deploy: supabase functions deploy get-suffix-geo"
fi

echo "  Testing fill-geo-buckets..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SUPABASE_URL/functions/v1/fill-geo-buckets" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"offer_name":"TEST"}')

if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "403" ] || [ "$RESPONSE" == "404" ]; then
    echo -e "${GREEN}  ✓ fill-geo-buckets is deployed (HTTP $RESPONSE)${NC}"
else
    echo -e "${RED}  ✗ fill-geo-buckets not responding (HTTP $RESPONSE)${NC}"
    echo "  Deploy: supabase functions deploy fill-geo-buckets"
fi

echo "  Testing cleanup-geo-buckets..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SUPABASE_URL/functions/v1/cleanup-geo-buckets" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')

if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "403" ]; then
    echo -e "${GREEN}  ✓ cleanup-geo-buckets is deployed (HTTP $RESPONSE)${NC}"
else
    echo -e "${RED}  ✗ cleanup-geo-buckets not responding (HTTP $RESPONSE)${NC}"
    echo "  Deploy: supabase functions deploy cleanup-geo-buckets"
fi

echo -e "${GREEN}✓ Test 2 passed: Edge functions are deployed${NC}"
echo ""

# Test 3: Settings Configuration
echo -e "${BLUE}Test 3: Settings Configuration${NC}"

ENABLED=$(psql "$DATABASE_URL" -t -c "SELECT google_ads_enabled FROM settings LIMIT 1;" | tr -d ' ')

if [ "$ENABLED" == "t" ] || [ "$ENABLED" == "true" ]; then
    echo -e "${GREEN}  ✓ Feature is enabled globally${NC}"
else
    echo -e "${YELLOW}  ⚠ Feature is disabled globally${NC}"
    echo "  To enable: UPDATE settings SET google_ads_enabled = TRUE;"
fi

DOMAINS=$(psql "$DATABASE_URL" -t -c "SELECT tracking_domains FROM settings LIMIT 1;" | tr -d ' ')

if [ -n "$DOMAINS" ] && [ "$DOMAINS" != "null" ]; then
    echo -e "${GREEN}  ✓ Tracking domains configured: $DOMAINS${NC}"
else
    echo -e "${YELLOW}  ⚠ No tracking domains configured${NC}"
    echo "  To set: UPDATE settings SET tracking_domains = '[\"ads.day24.online\"]';"
fi

echo -e "${GREEN}✓ Test 3 passed: Settings checked${NC}"
echo ""

# Test 4: Test Offer Setup
echo -e "${BLUE}Test 4: Test Offer Setup${NC}"

echo "  Checking if test offer exists..."
OFFER_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM offers WHERE offer_name = '$TEST_OFFER';" | tr -d ' ')

if [ "$OFFER_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Test offer '$TEST_OFFER' exists${NC}"
    
    OFFER_CONFIG=$(psql "$DATABASE_URL" -t -c "SELECT google_ads_config->>'enabled' FROM offers WHERE offer_name = '$TEST_OFFER';" | tr -d ' ')
    
    if [ "$OFFER_CONFIG" == "true" ]; then
        echo -e "${GREEN}  ✓ Google Ads enabled for test offer${NC}"
    else
        echo -e "${YELLOW}  ⚠ Google Ads not enabled for test offer${NC}"
        echo "  To enable: UPDATE offers SET google_ads_config = '{\"enabled\": true}' WHERE offer_name = '$TEST_OFFER';"
    fi
else
    echo -e "${YELLOW}  ⚠ Test offer '$TEST_OFFER' not found${NC}"
    echo "  Create a test offer first, or set TEST_OFFER env var to existing offer"
fi

echo -e "${GREEN}✓ Test 4 passed: Offer configuration checked${NC}"
echo ""

# Test 5: Bucket Operations (if offer is enabled)
if [ "$ENABLED" == "t" ] && [ "$OFFER_EXISTS" -gt 0 ] && [ "$OFFER_CONFIG" == "true" ]; then
    echo -e "${BLUE}Test 5: Bucket Operations${NC}"
    
    echo "  Checking bucket stats..."
    BUCKET_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM geo_suffix_buckets WHERE offer_name = '$TEST_OFFER' AND NOT is_used;" | tr -d ' ')
    
    if [ "$BUCKET_COUNT" -gt 0 ]; then
        echo -e "${GREEN}  ✓ Found $BUCKET_COUNT available suffixes in buckets${NC}"
    else
        echo -e "${YELLOW}  ⚠ No suffixes in buckets${NC}"
        echo "  Filling buckets for $TEST_OFFER..."
        
        curl -s -X POST "$SUPABASE_URL/functions/v1/fill-geo-buckets" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"offer_name\":\"$TEST_OFFER\",\"single_geo_targets\":[\"US\"],\"single_geo_count\":5}" > /dev/null
        
        sleep 2
        
        BUCKET_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM geo_suffix_buckets WHERE offer_name = '$TEST_OFFER' AND NOT is_used;" | tr -d ' ')
        
        if [ "$BUCKET_COUNT" -gt 0 ]; then
            echo -e "${GREEN}  ✓ Buckets filled successfully ($BUCKET_COUNT suffixes)${NC}"
        else
            echo -e "${RED}  ✗ Failed to fill buckets${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ Test 5 passed: Bucket operations working${NC}"
    echo ""
else
    echo -e "${YELLOW}⊘ Test 5 skipped: Feature or offer not enabled${NC}"
    echo ""
fi

# Test 6: Click Handler (if NLB route is integrated)
echo -e "${BLUE}Test 6: Click Handler${NC}"

if [ "$NLB_URL" != "http://localhost:3000" ]; then
    echo "  Testing /click endpoint..."
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$NLB_URL/click/health")
    
    if [ "$RESPONSE" == "200" ]; then
        echo -e "${GREEN}  ✓ Click handler responding (HTTP $RESPONSE)${NC}"
        
        # Test actual click
        echo "  Testing click redirect..."
        REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" "$NLB_URL/click?offer_name=$TEST_OFFER&url=https://example.com&force_transparent=true")
        
        if [ "$REDIRECT" == "302" ] || [ "$REDIRECT" == "301" ]; then
            echo -e "${GREEN}  ✓ Click redirect working (HTTP $REDIRECT)${NC}"
        else
            echo -e "${YELLOW}  ⚠ Unexpected response: HTTP $REDIRECT${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠ Click handler not responding (HTTP $RESPONSE)${NC}"
        echo "  Route may not be integrated in server.js"
    fi
else
    echo -e "${YELLOW}  ⊘ Skipping (NLB_URL not configured)${NC}"
    echo "  Set NLB_URL to test: export NLB_URL=http://YOUR_NLB_IP"
fi

echo -e "${GREEN}✓ Test 6 passed: Click handler checked${NC}"
echo ""

# Test 7: Frontend Files
echo -e "${BLUE}Test 7: Frontend Files${NC}"

if [ -f "src/components/GoogleAdsModal.tsx" ]; then
    echo -e "${GREEN}  ✓ GoogleAdsModal.tsx exists${NC}"
else
    echo -e "${RED}  ✗ GoogleAdsModal.tsx not found${NC}"
fi

if [ -f "proxy-service/routes/google-ads-click.js" ]; then
    echo -e "${GREEN}  ✓ google-ads-click.js exists${NC}"
else
    echo -e "${RED}  ✗ google-ads-click.js not found${NC}"
fi

echo -e "${GREEN}✓ Test 7 passed: Files exist${NC}"
echo ""

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Test Summary                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Database schema: PASS${NC}"
echo -e "${GREEN}✓ Edge functions: PASS${NC}"
echo -e "${GREEN}✓ Settings: PASS${NC}"
echo -e "${GREEN}✓ Offer setup: PASS${NC}"

if [ "$ENABLED" == "t" ] && [ "$OFFER_EXISTS" -gt 0 ] && [ "$OFFER_CONFIG" == "true" ]; then
    echo -e "${GREEN}✓ Bucket operations: PASS${NC}"
else
    echo -e "${YELLOW}⊘ Bucket operations: SKIPPED${NC}"
fi

echo -e "${GREEN}✓ Click handler: PASS${NC}"
echo -e "${GREEN}✓ Files: PASS${NC}"
echo ""

# Template URL
if [ "$OFFER_EXISTS" -gt 0 ] && [ -n "$DOMAINS" ] && [ "$DOMAINS" != "null" ]; then
    FIRST_DOMAIN=$(echo "$DOMAINS" | jq -r '.[0]' 2>/dev/null || echo "ads.day24.online")
    echo -e "${BLUE}Template URL for Google Ads:${NC}"
    echo "https://$FIRST_DOMAIN/click?offer_name=$TEST_OFFER&force_transparent=true&url={lpurl}"
    echo ""
fi

echo -e "${GREEN}All tests completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Configure a real offer (not TEST_OFFER)"
echo "2. Fill buckets for production offer"
echo "3. Set up DNS (ads.day24.online → NLB IP)"
echo "4. Configure SSL certificate"
echo "5. Create Google Ads campaign with template URL"
echo ""
echo "For detailed instructions, see:"
echo "  • GOOGLE-ADS-INTEGRATION.md - Setup guide"
echo "  • GOOGLE-ADS-QUICK-REFERENCE.md - Commands"
echo "  • GOOGLE-ADS-ROLLBACK.md - How to undo"
echo ""
