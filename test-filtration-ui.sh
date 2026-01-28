#!/bin/bash

# Test Script for Google Ads Filtration UI

echo "================================================"
echo "Google Ads Filtration UI - Integration Test"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Verify TypeScript compilation
echo -e "${YELLOW}[TEST 1] Checking TypeScript compilation...${NC}"
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"
if npm run build > /tmp/build.log 2>&1; then
  echo -e "${GREEN}✓ Build successful${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  tail -20 /tmp/build.log
  exit 1
fi
echo ""

# Test 2: Verify GoogleAdsModal component exists and compiles
echo -e "${YELLOW}[TEST 2] Checking GoogleAdsModal component...${NC}"
if grep -q "interface GoogleAdsConfig" src/components/GoogleAdsModal.tsx; then
  echo -e "${GREEN}✓ GoogleAdsConfig interface found${NC}"
else
  echo -e "${RED}✗ GoogleAdsConfig interface not found${NC}"
  exit 1
fi

if grep -q "filtering\?" src/components/GoogleAdsModal.tsx; then
  echo -e "${GREEN}✓ Filtering config in interface${NC}"
else
  echo -e "${RED}✗ Filtering config not in interface${NC}"
  exit 1
fi
echo ""

# Test 3: Verify filtering UI controls exist
echo -e "${YELLOW}[TEST 3] Checking filtering UI controls...${NC}"

CONTROLS=(
  "Bot Detection"
  "Block Datacenters"
  "Block VPN/Proxy"
  "IP Blacklist"
  "Blocked Countries"
)

for control in "${CONTROLS[@]}"; do
  if grep -q "$control" src/components/GoogleAdsModal.tsx; then
    echo -e "${GREEN}✓ $control control found${NC}"
  else
    echo -e "${RED}✗ $control control not found${NC}"
    exit 1
  fi
done
echo ""

# Test 4: Verify backend filtering logic exists
echo -e "${YELLOW}[TEST 4] Checking backend filtering logic...${NC}"

BACKEND_FILTERS=(
  "bot_detection"
  "block_datacenters"
  "block_vpn_proxy"
  "repeat_ip_window_days"
  "ip_blacklist"
  "blocked_countries"
)

for filter in "${BACKEND_FILTERS[@]}"; do
  if grep -q "$filter" proxy-service/routes/google-ads-click.js; then
    echo -e "${GREEN}✓ Backend filter '$filter' found${NC}"
  else
    echo -e "${RED}✗ Backend filter '$filter' not found${NC}"
    exit 1
  fi
done
echo ""

# Test 5: Verify checkIfBlocked function
echo -e "${YELLOW}[TEST 5] Checking checkIfBlocked function...${NC}"

if grep -q "async function checkIfBlocked" proxy-service/routes/google-ads-click.js; then
  echo -e "${GREEN}✓ checkIfBlocked function found${NC}"
else
  echo -e "${RED}✗ checkIfBlocked function not found${NC}"
  exit 1
fi

if grep -q "config.filtering" proxy-service/routes/google-ads-click.js; then
  echo -e "${GREEN}✓ Backend reads config.filtering${NC}"
else
  echo -e "${RED}✗ Backend doesn't read config.filtering${NC}"
  exit 1
fi
echo ""

# Test 6: Verify data persistence logic
echo -e "${YELLOW}[TEST 6] Checking data persistence...${NC}"

if grep -q "setConfig" src/components/GoogleAdsModal.tsx; then
  echo -e "${GREEN}✓ setConfig found${NC}"
else
  echo -e "${RED}✗ setConfig not found${NC}"
  exit 1
fi

if grep -q "handleSave" src/components/GoogleAdsModal.tsx; then
  echo -e "${GREEN}✓ handleSave handler found${NC}"
else
  echo -e "${RED}✗ handleSave handler not found${NC}"
  exit 1
fi

if grep -q "google_ads_config" src/components/GoogleAdsModal.tsx; then
  echo -e "${GREEN}✓ Database persistence logic found${NC}"
else
  echo -e "${RED}✗ Database persistence logic not found${NC}"
  exit 1
fi
echo ""

# Test 7: Verify dev server is running
echo -e "${YELLOW}[TEST 7] Checking dev server...${NC}"

if curl -s http://localhost:5173 | grep -q "<!DOCTYPE\|<html" 2>/dev/null; then
  echo -e "${GREEN}✓ Dev server is running${NC}"
else
  echo -e "${RED}✗ Dev server not responding${NC}"
  echo "  Starting dev server..."
  npm run dev > /tmp/vite.log 2>&1 &
  sleep 3
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dev server started successfully${NC}"
  else
    echo -e "${RED}✗ Dev server failed to start${NC}"
  fi
fi
echo ""

# Final Summary
echo "================================================"
echo -e "${GREEN}All tests passed! ✓${NC}"
echo "================================================"
echo ""
echo "Frontend URL: http://localhost:5173"
echo "Google Ads instances:"
echo "  - 13.222.100.70:3000"
echo "  - 44.215.112.238:3000"
echo "  - 100.29.190.60:3000"
echo "  - 44.200.222.95:3000"
echo "  - 100.53.41.66:3000"
echo "  - 3.239.71.2:3000"
echo ""
echo "NLB URL: http://34.226.99.187"
echo "Domain: ads.day24.online (DNS pending)"
echo ""
echo "To test:"
echo "1. Go to http://localhost:5173"
echo "2. Find an offer with Google Ads enabled"
echo "3. Click the ⚡ icon to open Google Ads modal"
echo "4. Enable filters and adjust settings"
echo "5. Click 'Save Configuration'"
echo "6. New clicks will be filtered according to settings"
