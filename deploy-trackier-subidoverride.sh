#!/bin/bash
set -e

echo "🚀 Deploying Trackier subIdOverride Integration"
echo "================================================"
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
NC='\033[0m' # No Color

# Track deployment status
DEPLOYED_COUNT=0
FAILED_INSTANCES=()

echo "📋 Deployment Plan:"
echo "  • Update 3 EC2 instances"
echo "  • Pull latest code from GitHub"
echo "  • Restart services with pm2"
echo "  • Monitor for stability (no restart loops)"
echo "  • Create AMI if all stable"
echo "  • Update Launch Template"
echo "  • Update Auto Scaling Group"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  STEP 1: Deploying to EC2 Instances"
echo "═══════════════════════════════════════════════════"
echo ""

for i in "${!INSTANCES[@]}"; do
  INSTANCE_IP="${INSTANCES[$i]}"
  INSTANCE_NUM=$((i + 1))
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Instance $INSTANCE_NUM of ${#INSTANCES[@]}: $INSTANCE_IP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Test connectivity
  echo "🔍 Testing connectivity..."
  if ! ssh -i $KEY_FILE -o ConnectTimeout=5 -o StrictHostKeyChecking=no ec2-user@$INSTANCE_IP "echo 'Connected'" 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to $INSTANCE_IP${NC}"
    FAILED_INSTANCES+=("$INSTANCE_IP")
    continue
  fi
  echo -e "${GREEN}✓ Connected${NC}"
  echo ""
  
  # Copy updated file directly from local machine
  echo "📋 Copying updated trackier-webhook.js..."
  scp -i $KEY_FILE "$REPO_DIR/proxy-service/routes/trackier-webhook.js" ec2-user@$INSTANCE_IP:~/proxy-service/routes/trackier-webhook.js
  echo -e "${GREEN}✓ File copied${NC}"
  echo ""
  
  # Get PM2 status before restart
  echo "📊 PM2 status before restart..."
  RESTARTS_BEFORE=$(ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "pm2 jlist 2>/dev/null | jq -r '.[].pm2_env.restart_time' | head -1" 2>/dev/null || echo "0")
  echo "   Current restart count: $RESTARTS_BEFORE"
  echo ""
  
  # Restart services
  echo "🔄 Restarting PM2 services..."
  ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "cd ~/proxy-service && pm2 restart all --update-env" 2>/dev/null
  echo -e "${GREEN}✓ Services restarted${NC}"
  echo ""
  
  # Wait for services to stabilize
  echo "⏳ Waiting 10 seconds for services to stabilize..."
  sleep 10
  echo ""
  
  # Check PM2 status after restart
  echo "📊 Checking service health..."
  ssh -i $KEY_FILE ec2-user@$INSTANCE_IP << 'HEALTH_SCRIPT'
echo "PM2 Status:"
pm2 list
echo ""
echo "Recent logs:"
pm2 logs --nostream --lines 10
HEALTH_SCRIPT
  echo ""
  
  # Check for restart loops
  echo "🔍 Checking for restart loops..."
  RESTARTS_AFTER=$(ssh -i $KEY_FILE ec2-user@$INSTANCE_IP "pm2 jlist 2>/dev/null | jq -r '.[].pm2_env.restart_time' | head -1" 2>/dev/null || echo "0")
  RESTART_DIFF=$((RESTARTS_AFTER - RESTARTS_BEFORE))
  
  if [ "$RESTART_DIFF" -le 1 ]; then
    echo -e "${GREEN}✓ No restart loop detected (restarts: $RESTARTS_BEFORE → $RESTARTS_AFTER)${NC}"
    DEPLOYED_COUNT=$((DEPLOYED_COUNT + 1))
  else
    echo -e "${RED}❌ Warning: Multiple restarts detected! ($RESTARTS_BEFORE → $RESTARTS_AFTER)${NC}"
    FAILED_INSTANCES+=("$INSTANCE_IP")
  fi
  echo ""
  
  echo -e "${GREEN}✅ Instance $INSTANCE_NUM deployment complete${NC}"
  echo ""
  
  if [ $INSTANCE_NUM -lt ${#INSTANCES[@]} ]; then
    echo "⏸  Pausing 5 seconds before next instance..."
    sleep 5
  fi
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Total instances: ${#INSTANCES[@]}"
echo -e "${GREEN}Successfully deployed: $DEPLOYED_COUNT${NC}"
echo -e "${RED}Failed: ${#FAILED_INSTANCES[@]}${NC}"

if [ ${#FAILED_INSTANCES[@]} -gt 0 ]; then
  echo ""
  echo "Failed instances:"
  for ip in "${FAILED_INSTANCES[@]}"; do
    echo "  • $ip"
  done
fi
echo ""

# Proceed with AMI only if all instances are stable
if [ $DEPLOYED_COUNT -ne ${#INSTANCES[@]} ]; then
  echo -e "${RED}❌ Not all instances deployed successfully. Aborting AMI creation.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All instances deployed successfully and stable!${NC}"
echo ""
read -p "Proceed with AMI creation, launch template, and ASG update? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping infrastructure updates."
    exit 0
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  STEP 2: Creating AMI from Instance 1"
echo "═══════════════════════════════════════════════════"
echo ""

# Get instance ID for first instance
INSTANCE_1_IP="${INSTANCES[0]}"
echo "🔍 Getting instance ID for $INSTANCE_1_IP..."

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=ip-address,Values=$INSTANCE_1_IP" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null)

if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo -e "${RED}❌ Could not find instance ID for $INSTANCE_1_IP${NC}"
  echo "Please provide instance ID manually or check AWS CLI configuration."
  read -p "Enter Instance ID (or press Enter to skip): " INSTANCE_ID
  if [ -z "$INSTANCE_ID" ]; then
    echo "Skipping AMI creation."
    exit 0
  fi
fi

echo -e "${GREEN}✓ Found instance: $INSTANCE_ID${NC}"
echo ""

# Create AMI
AMI_NAME="trackier-subIdOverride-$(date +%Y%m%d-%H%M%S)"
echo "📸 Creating AMI: $AMI_NAME"
echo "   From instance: $INSTANCE_ID"
echo ""

AMI_ID=$(aws ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "Trackier subIdOverride integration with 14-field support (p1-p10, erid, app_name, app_id, cr_name)" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Name,Value=$AMI_NAME},{Key=Component,Value=trackier-integration},{Key=Date,Value=$(date +%Y-%m-%d)}]" \
  --query 'ImageId' \
  --output text)

if [ -z "$AMI_ID" ]; then
  echo -e "${RED}❌ Failed to create AMI${NC}"
  exit 1
fi

echo -e "${GREEN}✅ AMI created: $AMI_ID${NC}"
echo ""

# Wait for AMI to be available
echo "⏳ Waiting for AMI to become available..."
aws ec2 wait image-available --image-ids "$AMI_ID"
echo -e "${GREEN}✓ AMI is available${NC}"
echo ""

echo "═══════════════════════════════════════════════════"
echo "  STEP 3: Updating Launch Template"
echo "═══════════════════════════════════════════════════"
echo ""

# Find launch template
echo "🔍 Finding launch template..."
LT_ID=$(aws ec2 describe-launch-templates \
  --filters "Name=tag:Name,Values=*suffix*" \
  --query 'LaunchTemplates[0].LaunchTemplateId' \
  --output text 2>/dev/null)

if [ "$LT_ID" == "None" ] || [ -z "$LT_ID" ]; then
  echo -e "${YELLOW}⚠️  Could not auto-detect launch template${NC}"
  read -p "Enter Launch Template ID (or press Enter to skip): " LT_ID
  if [ -z "$LT_ID" ]; then
    echo "Skipping launch template update."
    echo ""
    echo "Manual steps:"
    echo "  1. Find your launch template in AWS Console"
    echo "  2. Create new version with AMI: $AMI_ID"
    exit 0
  fi
fi

echo -e "${GREEN}✓ Found launch template: $LT_ID${NC}"
echo ""

# Create new launch template version
echo "📝 Creating new launch template version with AMI: $AMI_ID"
NEW_VERSION=$(aws ec2 create-launch-template-version \
  --launch-template-id "$LT_ID" \
  --source-version '$Latest' \
  --launch-template-data "{\"ImageId\":\"$AMI_ID\"}" \
  --query 'LaunchTemplateVersion.VersionNumber' \
  --output text)

echo -e "${GREEN}✅ Created launch template version: $NEW_VERSION${NC}"
echo ""

# Set as default version
echo "🔄 Setting version $NEW_VERSION as default..."
aws ec2 modify-launch-template \
  --launch-template-id "$LT_ID" \
  --default-version "$NEW_VERSION" >/dev/null

echo -e "${GREEN}✓ Default version updated${NC}"
echo ""

echo "═══════════════════════════════════════════════════"
echo "  STEP 4: Updating Auto Scaling Group"
echo "═══════════════════════════════════════════════════"
echo ""

# Find ASG
echo "🔍 Finding Auto Scaling Group..."
ASG_NAME=$(aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[?contains(Tags[?Key==`Name`].Value, `suffix`) == `true`].AutoScalingGroupName' \
  --output text 2>/dev/null | head -1)

if [ -z "$ASG_NAME" ] || [ "$ASG_NAME" == "None" ]; then
  echo -e "${YELLOW}⚠️  Could not auto-detect Auto Scaling Group${NC}"
  read -p "Enter ASG Name (or press Enter to skip): " ASG_NAME
  if [ -z "$ASG_NAME" ]; then
    echo "Skipping ASG update."
    echo ""
    echo "Manual steps:"
    echo "  1. Find your ASG in AWS Console"
    echo "  2. Update to use launch template $LT_ID version $NEW_VERSION"
    exit 0
  fi
fi

echo -e "${GREEN}✓ Found ASG: $ASG_NAME${NC}"
echo ""

# Update ASG to use new launch template version
echo "🔄 Updating ASG to use latest launch template..."
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name "$ASG_NAME" \
  --launch-template "LaunchTemplateId=$LT_ID,Version=\$Latest"

echo -e "${GREEN}✓ ASG updated${NC}"
echo ""

# Ask about instance refresh
read -p "Trigger rolling instance refresh to update existing instances? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "🔄 Starting instance refresh..."
  REFRESH_ID=$(aws autoscaling start-instance-refresh \
    --auto-scaling-group-name "$ASG_NAME" \
    --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":300}' \
    --query 'InstanceRefreshId' \
    --output text)
  
  echo -e "${GREEN}✅ Instance refresh started: $REFRESH_ID${NC}"
  echo ""
  echo "Monitor progress:"
  echo "  aws autoscaling describe-instance-refreshes --auto-scaling-group-name $ASG_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🎉 DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✓ Deployed to $DEPLOYED_COUNT instances"
echo "  ✓ Created AMI: $AMI_ID"
echo "  ✓ Updated Launch Template: $LT_ID (v$NEW_VERSION)"
echo "  ✓ Updated ASG: $ASG_NAME"
echo ""
echo "Changes Deployed:"
echo "  • Trackier subIdOverride support (14 fields)"
echo "  • p1-p10, erid, app_name, app_id, cr_name"
echo "  • Cache-busting parameter support"
echo ""
echo "Known Limitation:"
echo "  • Trackier cache serves stale values for 20-60s after API updates"
echo "  • This is a Trackier platform behavior, not a code issue"
echo ""
echo "Next Steps:"
echo "  1. Monitor PM2 logs: ssh -i $KEY_FILE ec2-user@${INSTANCES[0]} 'pm2 logs'"
echo "  2. Test end-to-end flow with real Trackier clicks"
echo "  3. Check webhook logs in Supabase dashboard"
echo ""
