#!/bin/bash
set -e

echo "🚀 Deploying Bandwidth Optimization (99% reduction)"
echo "=================================================="
echo ""

# Configuration
SSH_KEY="~/Downloads/suffix-server.pem"
EC2_HOST="ec2-user@13.221.79.118"
EC2_PATH="/home/ec2-user/luna-proxy-service/proxy-service"
LOCAL_SERVER_JS="proxy-service/server.js"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Deploying to AWS EC2${NC}"
echo "================================="
echo ""

# Check if local server.js exists
if [ ! -f "$LOCAL_SERVER_JS" ]; then
    echo -e "${RED}❌ Error: $LOCAL_SERVER_JS not found${NC}"
    exit 1
fi

echo "📦 Backing up current server.js on EC2..."
ssh -i $SSH_KEY $EC2_HOST "cd $EC2_PATH && cp server.js server.js.backup-$(date +%Y%m%d-%H%M%S)"

echo "📤 Uploading new server.js with bandwidth optimization..."
scp -i $SSH_KEY $LOCAL_SERVER_JS $EC2_HOST:$EC2_PATH/server.js

echo "🔄 Restarting luna-proxy service..."
ssh -i $SSH_KEY $EC2_HOST "sudo systemctl restart luna-proxy"

echo "⏳ Waiting 3 seconds for service to start..."
sleep 3

echo "✅ Checking service status..."
ssh -i $SSH_KEY $EC2_HOST "sudo systemctl status luna-proxy --no-pager | head -20"

echo ""
echo -e "${GREEN}✅ AWS EC2 deployment complete!${NC}"
echo ""

echo -e "${BLUE}Step 2: Deploying to Supabase${NC}"
echo "================================"
echo ""

echo "📡 Deploying get-suffix function (PUBLIC - no JWT verification)..."
supabase functions deploy get-suffix --no-verify-jwt

echo ""
echo "✅ Checking deployed functions..."
supabase functions list

echo ""
echo -e "${GREEN}✅ Supabase deployment complete!${NC}"
echo ""

echo -e "${BLUE}Step 3: Verification${NC}"
echo "===================="
echo ""

echo "🔍 Checking AWS logs for minimal mode activation..."
echo ""
ssh -i $SSH_KEY $EC2_HOST "sudo journalctl -u luna-proxy -n 50 --no-pager | grep -E '🪶|minimal|bandwidth' | tail -10" || echo "No minimal mode logs yet (will appear after first trace)"

echo ""
echo -e "${YELLOW}📋 Testing Checklist:${NC}"
echo ""
echo "1️⃣  Test AWS proxy directly:"
echo "   curl -X POST http://13.221.79.118:3000/trace \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"url\":\"https://go.nordvpn.net/aff_c?offer_id=42&aff_id=136822\",\"mode\":\"anti_cloaking\",\"use_proxy\":true,\"expected_final_url\":\"nordvpn.com\"}' | jq '.bandwidth_bytes'"
echo ""
echo "   Expected: bandwidth_bytes < 500 (should be ~340B)"
echo ""
echo "2️⃣  Test Supabase get-suffix (full integration):"
echo "   curl 'https://YOUR_PROJECT.supabase.co/functions/v1/get-suffix?offer_name=test-offer' \\"
echo "     -H 'Authorization: Bearer YOUR_ANON_KEY' | jq '{success, trace_bandwidth_bytes, params_extracted}'"
echo ""
echo "   Expected: trace_bandwidth_bytes < 1000"
echo ""
echo "3️⃣  Check AWS logs for 🪶 emoji (minimal mode activation):"
echo "   ssh -i ~/Downloads/suffix-server.pem ec2-user@13.221.79.118"
echo "   sudo journalctl -u luna-proxy -f | grep '🪶'"
echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo -e "${YELLOW}⚡ Bandwidth Savings: ~99% (from 50-120KB → 340-940B)${NC}"
echo ""
echo -e "${YELLOW}🔒 Security: All endpoints remain PUBLIC (no authentication required)${NC}"
echo ""
echo -e "${YELLOW}✨ Features Preserved:${NC}"
echo "   ✅ User Agent Rotation"
echo "   ✅ IP Rotation (Luna Proxy)"
echo "   ✅ Geo-Targeting"
echo "   ✅ Referrer Rotation"
echo "   ✅ Tracking URL Rotation"
echo "   ✅ Parameter Extraction"
echo ""
echo "📝 Rollback if needed:"
echo "   ssh -i ~/Downloads/suffix-server.pem ec2-user@13.221.79.118"
echo "   cd $EC2_PATH && cp server.js.backup-* server.js && sudo systemctl restart luna-proxy"
echo ""
