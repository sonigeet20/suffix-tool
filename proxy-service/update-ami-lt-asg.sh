#!/bin/bash
set -e

echo "🚀 AWS Infrastructure Update: AMI → Launch Template → ASG"
echo "==========================================================="
echo ""

# Configuration
REGION="us-east-1"
SOURCE_INSTANCE="i-0a77843bdcda2a6f7"  # 3.223.135.219 - working instance
AMI_NAME="url-tracker-proxy-trackier-$(date +%Y%m%d-%H%M%S)"
AMI_DESCRIPTION="URL Tracker Proxy with Trackier integration - Edge function + routes"

echo "Step 1: Creating new AMI from instance $SOURCE_INSTANCE..."
AMI_ID=$(aws ec2 create-image \
  --region $REGION \
  --instance-id $SOURCE_INSTANCE \
  --name "$AMI_NAME" \
  --description "$AMI_DESCRIPTION" \
  --no-reboot \
  --query 'ImageId' \
  --output text)

echo "  ✅ AMI creation initiated: $AMI_ID"
echo "  ⏳ Waiting for AMI to become available..."

aws ec2 wait image-available --region $REGION --image-ids $AMI_ID
echo "  ✅ AMI is ready: $AMI_ID"
echo ""

echo "Step 2: Finding Launch Template..."
LT_INFO=$(aws autoscaling describe-auto-scaling-groups \
  --region $REGION \
  --query 'AutoScalingGroups[*].[LaunchTemplate.LaunchTemplateName,LaunchTemplate.LaunchTemplateId]' \
  --output text | head -1)

if [ -z "$LT_INFO" ]; then
  echo "  ❌ No Launch Template found. Please check your ASG configuration."
  exit 1
fi

LT_NAME=$(echo $LT_INFO | awk '{print $1}')
LT_ID=$(echo $LT_INFO | awk '{print $2}')

echo "  ✅ Found Launch Template: $LT_NAME ($LT_ID)"
echo ""

echo "Step 3: Creating new Launch Template version with AMI $AMI_ID..."
NEW_VERSION=$(aws ec2 create-launch-template-version \
  --region $REGION \
  --launch-template-id $LT_ID \
  --source-version '$Latest' \
  --launch-template-data "{\"ImageId\":\"$AMI_ID\"}" \
  --query 'LaunchTemplateVersion.VersionNumber' \
  --output text)

echo "  ✅ Created Launch Template version: $NEW_VERSION"
echo ""

echo "Step 4: Setting new version as default..."
aws ec2 modify-launch-template \
  --region $REGION \
  --launch-template-id $LT_ID \
  --default-version $NEW_VERSION

echo "  ✅ Launch Template default version updated to: $NEW_VERSION"
echo ""

echo "Step 5: Finding and updating Auto Scaling Group..."
ASG_NAME=$(aws autoscaling describe-auto-scaling-groups \
  --region $REGION \
  --query "AutoScalingGroups[?LaunchTemplate.LaunchTemplateId=='$LT_ID'].AutoScalingGroupName" \
  --output text | head -1)

if [ -z "$ASG_NAME" ]; then
  echo "  ⚠️  No ASG found using this Launch Template"
else
  echo "  ✅ Found ASG: $ASG_NAME"
  
  # Trigger instance refresh
  echo "  🔄 Starting instance refresh (rolling update)..."
  aws autoscaling start-instance-refresh \
    --region $REGION \
    --auto-scaling-group-name "$ASG_NAME" \
    --preferences '{"MinHealthyPercentage": 66, "InstanceWarmup": 60}' \
    --query 'InstanceRefreshId' \
    --output text
  
  echo "  ✅ Instance refresh initiated (will gradually replace old instances)"
fi

echo ""
echo "=========================================="
echo "✅ Infrastructure Update Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  • New AMI: $AMI_ID ($AMI_NAME)"
echo "  • Launch Template: $LT_NAME (v$NEW_VERSION)"
if [ -n "$ASG_NAME" ]; then
  echo "  • ASG: $ASG_NAME (rolling update in progress)"
fi
echo ""
echo "Next steps:"
echo "  1. Monitor instance refresh: aws autoscaling describe-instance-refreshes --region $REGION --auto-scaling-group-name '$ASG_NAME'"
echo "  2. Apply migration to Supabase (20260110025000_fix_trackier_columns.sql)"
echo "  3. Update Trackier config: update_interval_seconds to 1"
echo "  4. Configure S2S Push URL in Trackier dashboard"
