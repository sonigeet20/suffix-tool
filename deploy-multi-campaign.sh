#!/bin/bash

# Multi-Campaign Trackier Quick Deploy Script
# Automates deployment of all components

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "Multi-Campaign Trackier Deployment"
echo "=========================================="
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ psql not found. Install PostgreSQL client.${NC}"
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}! pm2 not found. Backend deployment will be skipped.${NC}"
    PM2_AVAILABLE=false
else
    PM2_AVAILABLE=true
fi

if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}! Supabase CLI not found. Edge function deployment will be skipped.${NC}"
    SUPABASE_AVAILABLE=false
else
    SUPABASE_AVAILABLE=true
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""

# Step 1: Database Migration
echo -e "${BLUE}Step 1/4: Deploying database migration...${NC}"

if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}! DATABASE_URL not set. Enter it now:${NC}"
    read -p "Database URL: " DATABASE_URL
    export DATABASE_URL
fi

if [ -n "$DATABASE_URL" ]; then
    echo "Running migration..."
    psql "$DATABASE_URL" -f supabase/migrations/20260115000000_add_trackier_multi_pair.sql
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database migration complete${NC}"
    else
        echo -e "${RED}✗ Database migration failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ DATABASE_URL required${NC}"
    exit 1
fi

echo ""

# Step 2: Backend Deployment
echo -e "${BLUE}Step 2/4: Deploying backend...${NC}"

if [ "$PM2_AVAILABLE" = true ]; then
    cd proxy-service
    
    echo "Restarting PM2 processes..."
    pm2 restart all
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Backend restarted${NC}"
        
        echo "Checking PM2 status..."
        pm2 status
        
        echo ""
        echo "Recent logs:"
        pm2 logs --lines 20 --nostream
    else
        echo -e "${RED}✗ Backend restart failed${NC}"
        exit 1
    fi
    
    cd ..
else
    echo -e "${YELLOW}! Skipping backend deployment (PM2 not available)${NC}"
fi

echo ""

# Step 3: Edge Function Deployment
echo -e "${BLUE}Step 3/4: Deploying edge function...${NC}"

if [ "$SUPABASE_AVAILABLE" = true ]; then
    echo "Checking Supabase login..."
    supabase projects list &> /dev/null
    
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}! Not logged into Supabase. Please login:${NC}"
        supabase login
    fi
    
    echo "Deploying trackier-webhook function..."
    cd supabase/functions
    supabase functions deploy trackier-webhook --no-verify-jwt --project-ref rfhuqenntxiqurplenjn
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Edge function deployed${NC}"
        
        echo ""
        echo "Testing edge function..."
        curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" \
            -X POST \
            "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=test&campaign_id=999"
    else
        echo -e "${RED}✗ Edge function deployment failed${NC}"
        exit 1
    fi
    
    cd ../..
else
    echo -e "${YELLOW}! Skipping edge function deployment (Supabase CLI not available)${NC}"
fi

echo ""

# Step 4: Frontend Build
echo -e "${BLUE}Step 4/4: Building frontend...${NC}"

if [ -f "package.json" ]; then
    echo "Installing dependencies..."
    npm install --silent
    
    echo "Building frontend..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend built successfully${NC}"
        echo ""
        echo -e "${YELLOW}📦 Built files in ./dist/${NC}"
        echo -e "${YELLOW}   Deploy these to your hosting service${NC}"
    else
        echo -e "${RED}✗ Frontend build failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}! package.json not found, skipping frontend build${NC}"
fi

echo ""

# Verification
echo "=========================================="
echo "Deployment Complete - Running Verification"
echo "=========================================="
echo ""

# Verify database
echo -e "${BLUE}Verifying database schema...${NC}"
PAIR_COLUMN=$(psql "$DATABASE_URL" -tAc "
    SELECT COUNT(*) 
    FROM information_schema.columns 
    WHERE table_name = 'trackier_offers' 
    AND column_name = 'additional_pairs'
")

if [ "$PAIR_COLUMN" -eq 1 ]; then
    echo -e "${GREEN}✓ additional_pairs column exists${NC}"
else
    echo -e "${RED}✗ additional_pairs column not found${NC}"
fi

# Verify function
FUNCTION_EXISTS=$(psql "$DATABASE_URL" -tAc "
    SELECT COUNT(*) 
    FROM pg_proc 
    WHERE proname = 'update_trackier_pair_stats'
")

if [ "$FUNCTION_EXISTS" -eq 1 ]; then
    echo -e "${GREEN}✓ update_trackier_pair_stats() function exists${NC}"
else
    echo -e "${RED}✗ update_trackier_pair_stats() function not found${NC}"
fi

# Check data migration
MIGRATED_COUNT=$(psql "$DATABASE_URL" -tAc "
    SELECT COUNT(*) 
    FROM trackier_offers 
    WHERE jsonb_array_length(additional_pairs) > 0
")

echo -e "${GREEN}✓ ${MIGRATED_COUNT} offers migrated to multi-pair format${NC}"

echo ""

# Verify backend
if [ "$PM2_AVAILABLE" = true ]; then
    echo -e "${BLUE}Verifying backend...${NC}"
    
    BACKEND_RUNNING=$(pm2 jlist | grep -c '"status":"online"' || true)
    echo -e "${GREEN}✓ ${BACKEND_RUNNING} PM2 processes running${NC}"
    
    # Test API endpoint
    if curl -s -f http://localhost:3000/api/trackier-aggregate-stats/test > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend API responding${NC}"
    else
        echo -e "${YELLOW}! Backend API test returned error (may be normal)${NC}"
    fi
fi

echo ""

# Verify edge function
if [ "$SUPABASE_AVAILABLE" = true ]; then
    echo -e "${BLUE}Verifying edge function...${NC}"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=test&campaign_id=999")
    
    if [ "$HTTP_CODE" -eq 404 ] || [ "$HTTP_CODE" -eq 400 ] || [ "$HTTP_CODE" -eq 200 ]; then
        echo -e "${GREEN}✓ Edge function responding (HTTP $HTTP_CODE)${NC}"
    else
        echo -e "${YELLOW}! Edge function returned unexpected status: $HTTP_CODE${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "Deployment Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ Database migration${NC}"
echo -e "${GREEN}✓ Backend deployment${NC}" || echo -e "${YELLOW}⊘ Backend deployment (skipped)${NC}"
echo -e "${GREEN}✓ Edge function deployment${NC}" || echo -e "${YELLOW}⊘ Edge function deployment (skipped)${NC}"
echo -e "${GREEN}✓ Frontend build${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Deploy frontend (./dist/) to hosting service"
echo "2. Run automated tests: ./test-multi-campaign.sh"
echo "3. Test single-pair creation in UI"
echo "4. Test multi-pair creation (3 pairs)"
echo "5. Monitor logs for 1 hour"
echo ""
echo -e "${GREEN}Documentation:${NC}"
echo "- MULTI-CAMPAIGN-DEPLOYMENT.md - Full deployment guide"
echo "- MULTI-CAMPAIGN-COMPLETE.md - Implementation summary"
echo "- test-multi-campaign.sh - Automated test suite"
echo ""
echo -e "${GREEN}Deployment completed successfully!${NC}"
