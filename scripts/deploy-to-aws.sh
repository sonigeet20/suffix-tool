#!/bin/bash
# Deploy Bright Data Fix to AWS
# Deploys changes to EC2 instances and Supabase

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   DEPLOY TO AWS - BRIGHT DATA FIX                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
SUPABASE_PROJECT_ID="rfhuqenntxiqurplenjn"
EC2_INSTANCES=(
  "44.193.24.197"
  "3.215.185.91"
  "18.209.212.159"
)
SSH_KEY="/Users/geetsoni/Downloads/suffix-server.pem"
GITHUB_REPO="git@github.com:sonigeet20/suffix-tool.git"

echo -e "${BLUE}📋 Pre-Deployment Checklist${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Run local tests
echo -e "${YELLOW}1. Running local tests...${NC}"
if bash scripts/test-local-brightdata-fix.sh > /tmp/test-results.log 2>&1; then
  echo -e "${GREEN}✅ All local tests passed${NC}"
else
  echo -e "${RED}❌ Local tests failed. Please fix before deploying.${NC}"
  cat /tmp/test-results.log | tail -30
  exit 1
fi

echo ""
echo -e "${YELLOW}2. Checking git status...${NC}"
git status --short
echo ""

read -p "Do you want to commit and push changes to GitHub? (yes/no): " -n 3 -r
echo ""
if [[ $REPLY =~ ^yes$ ]]; then
  echo -e "${BLUE}Committing changes...${NC}"
  git add -A
  git commit -m "fix: Add Bright Data user_context + proxy provider selection

- Fix 'requires user context' error for Bright Data Browser API
- Add intelligent proxy provider selection layer
- Implement offer provider override support
- Create separate handlers for each proxy provider type
- Maintain full backward compatibility
- Add comprehensive test suite and documentation" || echo "No changes to commit"
  
  echo -e "${BLUE}Pushing to GitHub...${NC}"
  git push origin main
  echo -e "${GREEN}✅ Changes pushed to GitHub${NC}"
else
  echo -e "${YELLOW}⚠️  Skipping git commit/push${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}🚀 DEPLOYING TO AWS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Deploy Supabase Edge Function
echo -e "${YELLOW}3. Deploying trace-redirects edge function to Supabase...${NC}"
if supabase functions deploy trace-redirects --project-id "$SUPABASE_PROJECT_ID" --no-verify-jwt; then
  echo -e "${GREEN}✅ Edge function deployed successfully${NC}"
else
  echo -e "${RED}❌ Edge function deployment failed${NC}"
  echo "Continuing with EC2 deployment..."
fi

echo ""
echo -e "${YELLOW}4. Deploying to EC2 instances...${NC}"

# Step 4: Deploy to each EC2 instance
DEPLOYED=0
FAILED=0

for instance in "${EC2_INSTANCES[@]}"; do
  echo ""
  echo -e "${BLUE}Deploying to EC2: $instance${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # SSH and deploy
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ec2-user@"$instance" << 'ENDSSH'
    set -e
    cd /home/ec2-user/suffix-tool || { echo "Directory not found"; exit 1; }
    
    echo "📥 Pulling latest changes from GitHub..."
    git pull origin main || { echo "Git pull failed"; exit 1; }
    
    echo "📦 Installing dependencies (if needed)..."
    cd proxy-service
    npm install --production 2>/dev/null || true
    
    echo "🔄 Restarting proxy-service with PM2..."
    pm2 restart proxy-service || pm2 start server.js --name proxy-service
    
    echo "✅ Deployment complete on this instance"
    
    echo "📊 Checking PM2 status..."
    pm2 list | grep proxy-service || true
    
    exit 0
ENDSSH
  then
    echo -e "${GREEN}✅ Successfully deployed to $instance${NC}"
    ((DEPLOYED++))
  else
    echo -e "${RED}❌ Failed to deploy to $instance${NC}"
    ((FAILED++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 DEPLOYMENT SUMMARY${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Successfully deployed: ${GREEN}$DEPLOYED${NC} instances"
echo -e "Failed deployments:    ${RED}$FAILED${NC} instances"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ DEPLOYMENT SUCCESSFUL!                                     ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Monitor logs: ssh -i $SSH_KEY ec2-user@${EC2_INSTANCES[0]}"
  echo "   Then run: pm2 logs proxy-service --lines 50"
  echo ""
  echo "2. Test Bright Data Browser API:"
  echo "   curl -X POST http://${EC2_INSTANCES[0]}:3000/trace \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"url\":\"https://example.com\",\"mode\":\"brightdata_browser\",\"user_id\":\"test\"}'"
  echo ""
  echo "3. Check for 'user_context set' messages in logs"
  echo ""
  exit 0
else
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  PARTIAL DEPLOYMENT                                        ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Some instances failed. Please check manually:"
  for instance in "${EC2_INSTANCES[@]}"; do
    echo "  ssh -i $SSH_KEY ec2-user@$instance"
  done
  echo ""
  exit 1
fi
