#!/bin/bash
#
# Create New AMI and Update Infrastructure
# 1. Creates AMI from test instance
# 2. Creates new launch template version
# 3. Updates ASG to use new template
# 4. Cleans up old AMIs (keeps current + new only)
#

set -e

# Configuration
TEST_INSTANCE_ID="i-0dd1314a4d6bd719b"  # Instance we tested on
ASG_NAME="url-tracker-proxy-asg"        # Auto Scaling Group name
LAUNCH_TEMPLATE_NAME="url-tracker-proxy-template"

echo "🏗️  Creating New AMI with SOCKS5 Support"
echo "================================================"
echo ""

# Step 1: Create AMI from test instance
echo "📸 Step 1: Creating AMI from test instance $TEST_INSTANCE_ID..."
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
NEW_AMI_NAME="url-tracker-proxy-socks5-${TIMESTAMP}"

NEW_AMI_ID=$(aws ec2 create-image \
  --instance-id "$TEST_INSTANCE_ID" \
  --name "$NEW_AMI_NAME" \
  --description "Proxy service with SOCKS5 protocol support - ${TIMESTAMP}" \
  --no-reboot \
  --query 'ImageId' \
  --output text)

echo "✅ AMI creation initiated: $NEW_AMI_ID"
echo "   Waiting for AMI to be available..."

aws ec2 wait image-available --image-ids "$NEW_AMI_ID"
echo "✅ AMI is now available: $NEW_AMI_ID"

# Tag the new AMI
aws ec2 create-tags \
  --resources "$NEW_AMI_ID" \
  --tags "Key=Name,Value=$NEW_AMI_NAME" "Key=Type,Value=proxy-service" "Key=SOCKS5,Value=enabled"

echo ""

# Step 2: Get current launch template info
echo "🔍 Step 2: Getting current launch template..."
CURRENT_LT_VERSION=$(aws ec2 describe-launch-templates \
  --launch-template-names "$LAUNCH_TEMPLATE_NAME" \
  --query 'LaunchTemplates[0].LatestVersionNumber' \
  --output text 2>/dev/null || echo "")

if [ -z "$CURRENT_LT_VERSION" ]; then
  echo "⚠️  Launch template not found, skipping LT update"
  SKIP_LT=true
else
  echo "✅ Current launch template version: $CURRENT_LT_VERSION"
  SKIP_LT=false
fi

# Step 3: Create new launch template version
if [ "$SKIP_LT" = false ]; then
  echo ""
  echo "🚀 Step 3: Creating new launch template version..."
  
  NEW_LT_VERSION=$(aws ec2 create-launch-template-version \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --source-version '$Latest' \
    --launch-template-data "{\"ImageId\":\"$NEW_AMI_ID\"}" \
    --version-description "SOCKS5 support - ${TIMESTAMP}" \
    --query 'LaunchTemplateVersion.VersionNumber' \
    --output text)
  
  echo "✅ New launch template version: $NEW_LT_VERSION"
  
  # Set as default
  aws ec2 modify-launch-template \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --default-version "$NEW_LT_VERSION"
  
  echo "✅ Set version $NEW_LT_VERSION as default"
fi

# Step 4: Update ASG (if exists)
echo ""
echo "🔄 Step 4: Checking Auto Scaling Group..."
ASG_EXISTS=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query 'AutoScalingGroups[0].AutoScalingGroupName' \
  --output text 2>/dev/null || echo "")

if [ "$ASG_EXISTS" = "$ASG_NAME" ] && [ "$SKIP_LT" = false ]; then
  echo "✅ ASG found, updating to use new launch template version..."
  
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=\$Latest"
  
  echo "✅ ASG updated to use latest launch template"
  echo ""
  echo "📝 Note: Existing instances will continue running."
  echo "   To replace them with new AMI:"
  echo "   - Terminate instances gradually, ASG will launch new ones"
  echo "   - Or use: aws autoscaling start-instance-refresh --auto-scaling-group-name $ASG_NAME"
else
  echo "⚠️  ASG not found or LT skipped, no ASG update needed"
fi

# Step 5: Clean up old AMIs (keep current + new only)
echo ""
echo "🧹 Step 5: Cleaning up old AMIs (url-tracker-proxy only)..."

# Get all proxy service AMIs (ONLY this project)
ALL_AMIS=$(aws ec2 describe-images \
  --owners self \
  --filters "Name=name,Values=url-tracker-proxy*" \
  --query 'Images[*].[ImageId,Name,CreationDate]' \
  --output text | sort -k3 -r)

# Count AMIs
AMI_COUNT=$(echo "$ALL_AMIS" | wc -l | tr -d ' ')
echo "Found $AMI_COUNT url-tracker-proxy AMIs (other AMIs untouched)"

if [ "$AMI_COUNT" -gt 2 ]; then
  echo ""
  echo "Keeping:"
  echo "$ALL_AMIS" | head -2 | while read -r AMI_ID AMI_NAME AMI_DATE; do
    echo "  ✅ $AMI_ID - $AMI_NAME ($AMI_DATE)"
  done
  
  echo ""
  echo "Deleting old AMIs:"
  echo "$ALL_AMIS" | tail -n +3 | while read -r AMI_ID AMI_NAME AMI_DATE; do
    echo "  🗑️  Deregistering $AMI_ID - $AMI_NAME ($AMI_DATE)..."
    
    # Get snapshot IDs before deregistering
    SNAPSHOTS=$(aws ec2 describe-images \
      --image-ids "$AMI_ID" \
      --query 'Images[0].BlockDeviceMappings[*].Ebs.SnapshotId' \
      --output text)
    
    # Deregister AMI
    aws ec2 deregister-image --image-id "$AMI_ID"
    
    # Delete associated snapshots
    for SNAPSHOT_ID in $SNAPSHOTS; do
      if [ -n "$SNAPSHOT_ID" ] && [ "$SNAPSHOT_ID" != "None" ]; then
        echo "     Deleting snapshot $SNAPSHOT_ID..."
        aws ec2 delete-snapshot --snapshot-id "$SNAPSHOT_ID" 2>/dev/null || true
      fi
    done
    
    echo "  ✅ Deleted $AMI_ID"
  done
else
  echo "✅ Only $AMI_COUNT AMI(s) found, no cleanup needed"
fi

# Summary
echo ""
echo "================================================"
echo "✅ Infrastructure Update Complete!"
echo "================================================"
echo ""
echo "📋 Summary:"
echo "  New AMI: $NEW_AMI_ID ($NEW_AMI_NAME)"
if [ "$SKIP_LT" = false ]; then
  echo "  Launch Template: $LAUNCH_TEMPLATE_NAME (v$NEW_LT_VERSION)"
fi
if [ "$ASG_EXISTS" = "$ASG_NAME" ]; then
  echo "  ASG: $ASG_NAME (updated)"
fi
echo ""
echo "📝 Rollback Plan:"
echo "  If issues occur, revert launch template to version $CURRENT_LT_VERSION:"
echo "  aws ec2 modify-launch-template --launch-template-name $LAUNCH_TEMPLATE_NAME --default-version $CURRENT_LT_VERSION"
echo ""
echo "🔄 To refresh instances with new AMI:"
echo "  aws autoscaling start-instance-refresh --auto-scaling-group-name $ASG_NAME"
echo ""
