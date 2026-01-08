#!/bin/bash

# Manual AMI Creation and Launch Template Update
# Run this locally with AWS CLI configured

set -e

echo "🚀 Manual AMI Creation from Fixed Instance"
echo "==========================================="
echo ""

# Configuration
REGION="us-east-1"
INSTANCE_ID="i-0xxxx"  # REPLACE with actual instance ID of 44.203.80.146
PROJECT_NAME="url-tracker-proxy"
KEY_NAME="suffix-server"

echo "⚠️  IMPORTANT: Update INSTANCE_ID in this script first!"
echo ""
echo "To find your instance ID, run:"
echo "  aws ec2 describe-instances --region us-east-1 --filters 'Name=ip-address,Values=44.203.80.146' --query 'Reservations[0].Instances[0].InstanceId' --output text"
echo ""
read -p "Press Enter to continue (or Ctrl+C to abort)..."
echo ""

# Step 1: Enable termination protection
echo "📌 Step 1: Enabling termination protection on $INSTANCE_ID..."
aws ec2 modify-instance-attribute \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --disable-api-termination

echo "✅ Termination protection enabled"
echo ""

# Step 2: Get instance details
echo "🔍 Step 2: Getting instance configuration..."
INSTANCE_TYPE=$(aws ec2 describe-instances \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].InstanceType' \
  --output text)

SECURITY_GROUP=$(aws ec2 describe-instances \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

echo "Instance Type: $INSTANCE_TYPE"
echo "Security Group: $SECURITY_GROUP"
echo ""

# Step 3: Create AMI
echo "📸 Step 3: Creating AMI (this takes 5-10 minutes)..."
AMI_NAME="${PROJECT_NAME}-browser-fix-$(date +%Y%m%d-%H%M%S)"
AMI_ID=$(aws ec2 create-image \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --name "$AMI_NAME" \
  --description "Proxy service with browser leak fix - $(date)" \
  --no-reboot \
  --query 'ImageId' \
  --output text)

echo "AMI ID: $AMI_ID"
echo "Waiting for AMI to be available..."
aws ec2 wait image-available --region $REGION --image-ids $AMI_ID
echo "✅ AMI created successfully!"
echo ""

# Step 4: Update Launch Template
echo "🚀 Step 4: Updating Launch Template..."
TEMPLATE_NAME="${PROJECT_NAME}-template"

# Check if template exists
if aws ec2 describe-launch-templates --region $REGION --launch-template-names $TEMPLATE_NAME &>/dev/null; then
  echo "Creating new version of existing launch template..."
  
  NEW_VERSION=$(aws ec2 create-launch-template-version \
    --region $REGION \
    --launch-template-name $TEMPLATE_NAME \
    --source-version '$Latest' \
    --launch-template-data "{\"ImageId\": \"$AMI_ID\"}" \
    --query 'LaunchTemplateVersion.VersionNumber' \
    --output text)
  
  echo "Created version: $NEW_VERSION"
  
  # Set as default
  aws ec2 modify-launch-template \
    --region $REGION \
    --launch-template-name $TEMPLATE_NAME \
    --default-version $NEW_VERSION
  
  echo "✅ Launch template updated (version $NEW_VERSION is now default)"
else
  echo "⚠️  Launch template not found: $TEMPLATE_NAME"
  echo "You may need to create the ASG infrastructure first."
fi
echo ""

# Step 5: Update ASG
echo "📊 Step 5: Checking Auto Scaling Group..."
ASG_NAME="${PROJECT_NAME}-asg"

if aws autoscaling describe-auto-scaling-groups --region $REGION --auto-scaling-group-names $ASG_NAME &>/dev/null; then
  echo "ASG found. Current configuration:"
  aws autoscaling describe-auto-scaling-groups \
    --region $REGION \
    --auto-scaling-group-names $ASG_NAME \
    --query 'AutoScalingGroups[0].[MinSize,DesiredCapacity,MaxSize]' \
    --output text | awk '{print "  Min: "$1", Desired: "$2", Max: "$3}'
  
  echo ""
  echo "To refresh instances with the new AMI, run:"
  echo "  aws autoscaling start-instance-refresh --auto-scaling-group-name $ASG_NAME --region $REGION"
else
  echo "⚠️  ASG not found: $ASG_NAME"
fi
echo ""

echo "==========================================="
echo "✅ Setup Complete!"
echo "==========================================="
echo ""
echo "AMI ID: $AMI_ID"
echo "AMI Name: $AMI_NAME"
echo ""
echo "New instances launched from the ASG will now have the browser leak fix."
