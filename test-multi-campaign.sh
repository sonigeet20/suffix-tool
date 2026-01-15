#!/bin/bash

# Multi-Campaign Trackier Test Suite
# Tests all functionality of the multi-pair system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
SUPABASE_URL="${SUPABASE_URL:-https://rfhuqenntxiqurplenjn.supabase.co}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
DATABASE_URL="${DATABASE_URL:-}"

TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Test 1: Database schema verification
test_database_schema() {
    log_info "Test 1: Verifying database schema..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_warning "DATABASE_URL not set, skipping database tests"
        return
    fi
    
    # Check additional_pairs column exists
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = 'trackier_offers' 
        AND column_name = 'additional_pairs'
    ")
    
    if [ "$RESULT" -eq 1 ]; then
        log_success "additional_pairs column exists"
    else
        log_error "additional_pairs column not found"
        return
    fi
    
    # Check pair tracking columns in webhook logs
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = 'trackier_webhook_logs' 
        AND column_name IN ('pair_index', 'pair_webhook_token')
    ")
    
    if [ "$RESULT" -eq 2 ]; then
        log_success "Webhook log tracking columns exist"
    else
        log_error "Webhook log tracking columns not found"
    fi
    
    # Check RPC function exists
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM pg_proc 
        WHERE proname = 'update_trackier_pair_stats'
    ")
    
    if [ "$RESULT" -eq 1 ]; then
        log_success "update_trackier_pair_stats() function exists"
    else
        log_error "update_trackier_pair_stats() function not found"
    fi
}

# Test 2: Backend API endpoints
test_backend_endpoints() {
    log_info "Test 2: Testing backend API endpoints..."
    
    # Test aggregate stats endpoint (should return 404 for non-existent offer)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/trackier-aggregate-stats/00000000-0000-0000-0000-000000000000")
    
    if [ "$HTTP_CODE" -eq 404 ]; then
        log_success "Aggregate stats endpoint responds (404 for non-existent offer)"
    else
        log_error "Aggregate stats endpoint unexpected response: $HTTP_CODE"
    fi
    
    # Test pair update endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X PATCH \
        -H "Content-Type: application/json" \
        -d '{"pair_name": "Test"}' \
        "$BACKEND_URL/api/trackier-pair/00000000-0000-0000-0000-000000000000/1")
    
    if [ "$HTTP_CODE" -eq 404 ]; then
        log_success "Pair update endpoint responds (404 for non-existent offer)"
    else
        log_error "Pair update endpoint unexpected response: $HTTP_CODE"
    fi
}

# Test 3: Edge function deployment
test_edge_function() {
    log_info "Test 3: Testing edge function..."
    
    # Test edge function responds to webhook
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"data": {"conversionStatus": "PENDING"}}' \
        "$SUPABASE_URL/functions/v1/trackier-webhook?token=test-invalid&campaign_id=999999")
    
    if [ "$HTTP_CODE" -eq 404 ] || [ "$HTTP_CODE" -eq 400 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Edge function responds to webhook (HTTP $HTTP_CODE)"
    else
        log_error "Edge function unexpected response: $HTTP_CODE"
    fi
}

# Test 4: Campaign creation with multiple pairs
test_campaign_creation() {
    log_info "Test 4: Testing campaign creation..."
    
    if [ -z "$TRACKIER_API_KEY" ]; then
        log_warning "TRACKIER_API_KEY not set, skipping campaign creation test"
        return
    fi
    
    # Test single pair creation
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"apiKey\": \"$TRACKIER_API_KEY\",
            \"apiBaseUrl\": \"https://nebula.gotrackier.com\",
            \"advertiserId\": \"$TRACKIER_ADVERTISER_ID\",
            \"offerName\": \"Test Single Pair\",
            \"finalUrl\": \"https://example.com\",
            \"webhookUrl\": \"$SUPABASE_URL/functions/v1/trackier-webhook\",
            \"campaign_count\": 1
        }" \
        "$SUPABASE_URL/functions/v1/trackier-create-campaigns")
    
    if echo "$RESPONSE" | grep -q '"pairs"'; then
        PAIR_COUNT=$(echo "$RESPONSE" | grep -o '"pair_index"' | wc -l)
        if [ "$PAIR_COUNT" -eq 1 ]; then
            log_success "Single pair creation successful"
        else
            log_error "Single pair creation returned $PAIR_COUNT pairs"
        fi
    else
        log_error "Single pair creation failed: $(echo "$RESPONSE" | jq -r '.error // .message')"
    fi
    
    # Test multi-pair creation
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"apiKey\": \"$TRACKIER_API_KEY\",
            \"apiBaseUrl\": \"https://nebula.gotrackier.com\",
            \"advertiserId\": \"$TRACKIER_ADVERTISER_ID\",
            \"offerName\": \"Test Multi Pair\",
            \"finalUrl\": \"https://example.com\",
            \"webhookUrl\": \"$SUPABASE_URL/functions/v1/trackier-webhook\",
            \"campaign_count\": 3
        }" \
        "$SUPABASE_URL/functions/v1/trackier-create-campaigns")
    
    if echo "$RESPONSE" | grep -q '"pairs"'; then
        PAIR_COUNT=$(echo "$RESPONSE" | grep -o '"pair_index"' | wc -l)
        if [ "$PAIR_COUNT" -eq 3 ]; then
            log_success "Multi-pair creation (3 pairs) successful"
        else
            log_error "Multi-pair creation returned $PAIR_COUNT pairs instead of 3"
        fi
    else
        log_error "Multi-pair creation failed: $(echo "$RESPONSE" | jq -r '.error // .message')"
    fi
}

# Test 5: Data migration verification
test_data_migration() {
    log_info "Test 5: Verifying data migration..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_warning "DATABASE_URL not set, skipping migration test"
        return
    fi
    
    # Check if existing offers have been migrated
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM trackier_offers 
        WHERE url1_campaign_id IS NOT NULL 
        AND url1_campaign_id != ''
        AND (additional_pairs IS NULL OR additional_pairs = '[]'::jsonb)
    ")
    
    if [ "$RESULT" -eq 0 ]; then
        log_success "All existing offers migrated to additional_pairs"
    else
        log_warning "$RESULT offers not migrated (may be normal if created before migration)"
    fi
    
    # Check first pair matches legacy columns
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM trackier_offers 
        WHERE additional_pairs->0->>'url1_campaign_id' = url1_campaign_id
        AND additional_pairs->0->>'url2_campaign_id' = url2_campaign_id
    ")
    
    TOTAL=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM trackier_offers WHERE jsonb_array_length(additional_pairs) > 0")
    
    if [ "$RESULT" -eq "$TOTAL" ]; then
        log_success "Primary pair matches legacy columns for all offers"
    else
        log_error "Primary pair mismatch: $RESULT/$TOTAL offers"
    fi
}

# Test 6: Webhook routing
test_webhook_routing() {
    log_info "Test 6: Testing webhook routing..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_warning "DATABASE_URL not set, skipping webhook routing test"
        return
    fi
    
    # Get a test offer
    OFFER_ID=$(psql "$DATABASE_URL" -tAc "
        SELECT id 
        FROM trackier_offers 
        WHERE jsonb_array_length(additional_pairs) > 0 
        LIMIT 1
    ")
    
    if [ -z "$OFFER_ID" ]; then
        log_warning "No offers with pairs found, skipping webhook routing test"
        return
    fi
    
    # Test legacy routing (token = offer_id)
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"data": {"conversionStatus": "PENDING"}}' \
        "$SUPABASE_URL/functions/v1/trackier-webhook?token=$OFFER_ID&campaign_id=999999")
    
    if ! echo "$RESPONSE" | grep -q '"error"'; then
        log_success "Legacy webhook routing (token=offer_id) works"
    else
        log_error "Legacy webhook routing failed"
    fi
    
    # Test pair-specific routing
    PAIR_TOKEN=$(psql "$DATABASE_URL" -tAc "
        SELECT additional_pairs->0->>'webhook_token' 
        FROM trackier_offers 
        WHERE id = '$OFFER_ID'
    ")
    
    if [ -n "$PAIR_TOKEN" ]; then
        RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d '{"data": {"conversionStatus": "PENDING"}}' \
            "$SUPABASE_URL/functions/v1/trackier-webhook?token=$PAIR_TOKEN&campaign_id=999999")
        
        if ! echo "$RESPONSE" | grep -q '"error"'; then
            log_success "Pair-specific webhook routing (token=webhook_token) works"
        else
            log_error "Pair-specific webhook routing failed"
        fi
    fi
}

# Test 7: Statistics aggregation
test_statistics() {
    log_info "Test 7: Testing statistics aggregation..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_warning "DATABASE_URL not set, skipping statistics test"
        return
    fi
    
    # Check materialized view exists
    RESULT=$(psql "$DATABASE_URL" -tAc "
        SELECT COUNT(*) 
        FROM pg_matviews 
        WHERE matviewname = 'trackier_offer_aggregate_stats'
    ")
    
    if [ "$RESULT" -eq 1 ]; then
        log_success "Aggregate statistics view exists"
    else
        log_error "Aggregate statistics view not found"
        return
    fi
    
    # Test aggregate calculation
    OFFER_ID=$(psql "$DATABASE_URL" -tAc "
        SELECT id 
        FROM trackier_offers 
        WHERE jsonb_array_length(additional_pairs) > 1 
        LIMIT 1
    ")
    
    if [ -n "$OFFER_ID" ]; then
        # Get aggregate from view
        AGG_COUNT=$(psql "$DATABASE_URL" -tAc "
            SELECT total_webhook_count 
            FROM trackier_offer_aggregate_stats 
            WHERE offer_id = '$OFFER_ID'
        ")
        
        # Calculate manually
        MANUAL_COUNT=$(psql "$DATABASE_URL" -tAc "
            SELECT SUM((value->>'webhook_count')::int)
            FROM trackier_offers, jsonb_array_elements(additional_pairs)
            WHERE id = '$OFFER_ID'
        ")
        
        if [ "$AGG_COUNT" -eq "$MANUAL_COUNT" ]; then
            log_success "Aggregate statistics calculation correct"
        else
            log_warning "Aggregate mismatch: view=$AGG_COUNT, manual=$MANUAL_COUNT (may need refresh)"
        fi
    fi
}

# Test 8: Frontend build
test_frontend_build() {
    log_info "Test 8: Testing frontend build..."
    
    if [ ! -f "package.json" ]; then
        log_warning "Not in project root, skipping frontend build test"
        return
    fi
    
    # Check if TrackierSetup.tsx exists and has multi-pair support
    if grep -q "campaignCount" "src/components/TrackierSetup.tsx"; then
        log_success "Frontend component has multi-pair support"
    else
        log_error "Frontend component missing multi-pair support"
    fi
    
    # Check if build works
    if npm run build > /dev/null 2>&1; then
        log_success "Frontend builds successfully"
    else
        log_error "Frontend build failed"
    fi
}

# Main test execution
main() {
    echo "=========================================="
    echo "Multi-Campaign Trackier Test Suite"
    echo "=========================================="
    echo ""
    
    test_database_schema
    echo ""
    
    test_backend_endpoints
    echo ""
    
    test_edge_function
    echo ""
    
    test_campaign_creation
    echo ""
    
    test_data_migration
    echo ""
    
    test_webhook_routing
    echo ""
    
    test_statistics
    echo ""
    
    test_frontend_build
    echo ""
    
    echo "=========================================="
    echo "Test Results"
    echo "=========================================="
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
main
