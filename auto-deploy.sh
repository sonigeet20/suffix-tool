#!/bin/bash
set -e

echo "🚀 Auto-Deploying Trackier subIdOverride Integration"
echo "===================================================="
echo ""

# Configuration
INSTANCES=(
  "44.193.24.197"
  "3.215.185.91"
  "18.209.212.159"
)
KEY_FILE="/Users/geetsoni/Downloads/suffix-server.pem"
REPO_DIR="/Users/geetsoni/Downloads/suffix-tool-main 2"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOYED_COUNT=0
FAILED_INSTANCES=()

echo "Deploying to ${#INSTANCES[@]} instances..."
echo ""

for i in "${!INSTANCES[@]}"; do
  INSTANCE_IP="${INSTANCES[$i]}"
  INSTANCE_NUM=$((i + 1))
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Instance $INSTANCE_NUM/${ #INSTANCES[@]}: $INSTANCE_IP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Test connectivity
  if ! ssh -i $KEY_FILE -o ConnectTimeout=5 -o StrictHostKeyChecking=no ec2-user@$INSTANCE_IP "echo 'OK'" &>/dev/null; then
    echo -e "${RED}❌ Cannot connect${NC}"
    FAILED_INSTANCES+=("$INSTANCE_IP")
    continue
  fi
  echo -e "${GREEN}✓ Connected${NC}"
  
  # Copy file
  echo "Copying trackier-webhook.js..."
  if scp -i $KEY_FILE -o StrictHostKeyChecking=no "$REPO_DIR/proxy-service/routes/trackier-webhook.js" ec2-user@$INSTANCE_IP:~/proxy-service/routes/ &>/dev/null; then
    echo -e "${GREEN}✓ File copied${NC}"
  else
    echo -e "${RED}❌ Copy failed${NC}"
    FAILED_INSTANCES+=("$INSTANCE_IP")
    continue
  fi
  
  # Get restart count before
  RESTARTS_BEFORE=$(ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.restart_time' 2>/dev/null || echo 0")
  
  # Restart PM2
  echo "Restarting PM2..."
  ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "cd ~/proxy-service && pm2 restart all --update-env" &>/dev/null
  echo -e "${GREEN}✓ Restarted${NC}"
  
  # Wait
  echo "Waiting 10s..."
  sleep 10
  
  # Check health
  STATUS=$(ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status' 2>/dev/null || echo 'unknown'")
  RESTARTS_AFTER=$(ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.restart_time' 2>/dev/null || echo 0")
  
  if [ "$STATUS" = "online" ]; then
    echo -e "${GREEN}✓ Service online (restarts: $RESTARTS_BEFORE → $RESTARTS_AFTER)${NC}"
    DEPLOYED_COUNT=$((DEPLOYED_COUNT + 1))
  else
    echo -e "${RED}❌ Service not healthy (status: $STATUS)${NC}"
    FAILED_INSTANCES+=("$INSTANCE_IP")
  fi
  
  echo ""
  sleep 3
done

echo "═══════════════════════════════════════════════════"
echo "  DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Total: ${#INSTANCES[@]}"
echo -e "${GREEN}Success: $DEPLOYED_COUNT${NC}"
echo -e "${RED}Failed: ${#FAILED_INSTANCES[@]}${NC}"
echo ""

if [ ${#FAILED_INSTANCES[@]} -gt 0 ]; then
  echo "Failed instances:"
  for ip in "${FAILED_INSTANCES[@]}"; do
    echo "  • $ip"
  done
  exit 1
fi

echo -e "${GREEN}✅ All instances deployed successfully!${NC}"
echo ""
echo "Next: Create AMI from instance 1 (${INSTANCES[0]})"
echo ""
