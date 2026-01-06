#!/bin/bash
# Quick AWS + Supabase Full Deployment
set -e

echo "🚀 Complete Deployment: AWS + Supabase"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Deploy Supabase Functions
echo -e "${YELLOW}Step 1: Deploying Supabase Edge Functions...${NC}"
./deploy-supabase.sh

echo ""
echo -e "${YELLOW}Step 2: Deploying to AWS EC2...${NC}"
cd proxy-service
./deploy-new-ec2.sh

echo ""
echo -e "${GREEN}✅ Full Deployment Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Get your EC2 public IP:"
echo "   aws ec2 describe-instances --profile url-tracker --filters 'Name=tag:Name,Values=luna-proxy-service' --query 'Reservations[0].Instances[0].PublicIpAddress' --output text"
echo ""
echo "2. Update trace-redirects with EC2 IP (if needed)"
echo ""
echo "3. Test the full system:"
echo "   See DEPLOY-ALL.md for test commands"
echo ""
