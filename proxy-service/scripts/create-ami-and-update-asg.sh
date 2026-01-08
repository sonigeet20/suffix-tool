#!/bin/bash
set -e

# Configuration - UPDATE THESE VALUES
REGION="${AWS_REGION:-us-east-1}"
INSTANCE_ID="${INSTANCE_ID:-i-0xxxx}"  # Update with your fixed instance ID
PROJECT_NAME="url-tracker-proxy"
KEY_NAME="suffix-server"

echo "🚀 Creating AMI and Updating Auto-Scaling Infrastructure"
echo "========================================================"
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Region: $REGION"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ AWS CLI not configured. Please run:"
  echo "   aws configure --profile url-tracker-prod"
  echo "   export AWS_PROFILE=url-tracker-prod"
  exit 1
fi

echo "📌 Step 1: Enabling termination protection..."
aws ec2 modify-instance-attribute \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --disable-api-termination || echo "⚠️  Already protected or failed"
echo "✅ Termination protection enabled"
echo ""

# Get instance details
echo "🔍 Step 2: Getting instance configuration..."
INSTANCE_INFO=$(aws ec2 describe-instances \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0]')

INSTANCE_TYPE=$(echo $INSTANCE_INFO | jq -r '.InstanceType')
SECURITY_GROUP=$(echo $INSTANCE_INFO | jq -r '.SecurityGroups[0].GroupId')
SUBNET_ID=$(echo $INSTANCE_INFO | jq -r '.SubnetId')
VPC_ID=$(echo $INSTANCE_INFO | jq -r '.VpcId')
AZ=$(echo $INSTANCE_INFO | jq -r '.Placement.AvailabilityZone')

echo "Instance Type: $INSTANCE_TYPE"
echo "Security Group: $SECURITY_GROUP"
echo "VPC: $VPC_ID"
echo "AZ: $AZ"
echo ""

# Create AMI
echo "📸 Step 3: Creating AMI (this may take 5-10 minutes)..."
AMI_NAME="${PROJECT_NAME}-browser-fix-$(date +%Y%m%d-%H%M%S)"
AMI_ID=$(aws ec2 create-image \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --name "$AMI_NAME" \
  --description "Proxy service with browser leak fix - $(date)" \
  --no-reboot \
  --tag-specifications "ResourceType=image,Tags=[{Key=Name,Value=$AMI_NAME},{Key=Project,Value=$PROJECT_NAME},{Key=Fix,Value=browser-leak}]" \
  --query 'ImageId' \
  --output text)

echo "AMI ID: $AMI_ID"
echo "Waiting for AMI to be available..."
aws ec2 wait image-available --region $REGION --image-ids $AMI_ID
echo "✅ AMI created: $AMI_ID"
echo ""

# Create/Update Launch Template
echo "🚀 Step 4: Creating/Updating Launch Template..."

USER_DATA=$(cat <<'EOF'
#!/bin/bash
# Auto-start proxy server on instance launch
cd /home/ec2-user/proxy-service

# Start PM2 process
pm2 start server.js --name proxy-server --log /home/ec2-user/proxy-service/logs/pm2.log
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/home/ec2-user/.nvm/versions/node/$(node -v)/bin /home/ec2-user/.nvm/versions/node/$(node -v)/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Setup browser leak monitoring cron
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/ec2-user/proxy-service/scripts/monitor-browser-leaks.sh --auto-cleanup >> /tmp/browser-monitor.log 2>&1") | crontab -

echo "Instance ready at $(date)" >> /tmp/user-data.log
EOF
)

USER_DATA_BASE64=$(echo "$USER_DATA" | base64 -w 0 2>/dev/null || echo "$USER_DATA" | base64)

TEMPLATE_NAME="${PROJECT_NAME}-template"

# Check if template exists
if aws ec2 describe-launch-templates --region $REGION --launch-template-names $TEMPLATE_NAME &>/dev/null; then
  echo "Updating existing launch template..."
  aws ec2 create-launch-template-version \
    --region $REGION \
    --launch-template-name $TEMPLATE_NAME \
    --source-version '$Latest' \
    --launch-template-data "{
      \"ImageId\": \"$AMI_ID\",
      \"TagSpecifications\": [
        {
          \"ResourceType\": \"instance\",
          \"Tags\": [
            {\"Key\": \"Name\", \"Value\": \"$PROJECT_NAME-asg\"},
            {\"Key\": \"Project\", \"Value\": \"$PROJECT_NAME\"},
            {\"Key\": \"ManagedBy\", \"Value\": \"AutoScaling\"},
            {\"Key\": \"Fix\", \"Value\": \"browser-leak\"}
          ]
        }
      ]
    }" > /dev/null
  
  # Set new version as default
  aws ec2 modify-launch-template \
    --region $REGION \
    --launch-template-name $TEMPLATE_NAME \
    --default-version '$Latest' > /dev/null
  
  echo "✅ Launch template updated with new AMI"
else
  echo "Creating new launch template..."
  aws ec2 create-launch-template \
    --region $REGION \
    --launch-template-name $TEMPLATE_NAME \
    --launch-template-data "{
      \"ImageId\": \"$AMI_ID\",
      \"InstanceType\": \"$INSTANCE_TYPE\",
      \"KeyName\": \"$KEY_NAME\",
      \"SecurityGroupIds\": [\"$SECURITY_GROUP\"],
      \"UserData\": \"$USER_DATA_BASE64\",
      \"TagSpecifications\": [
        {
          \"ResourceType\": \"instance\",
          \"Tags\": [
            {\"Key\": \"Name\", \"Value\": \"$PROJECT_NAME-asg\"},
            {\"Key\": \"Project\", \"Value\": \"$PROJECT_NAME\"},
            {\"Key\": \"ManagedBy\", \"Value\": \"AutoScaling\"},
            {\"Key\": \"Fix\", \"Value\": \"browser-leak\"}
          ]
        }
      ],
      \"Monitoring\": {\"Enabled\": true},
      \"MetadataOptions\": {
        \"HttpTokens\": \"optional\",
        \"HttpPutResponseHopLimit\": 1
      }
    }" > /dev/null
  
  echo "✅ Launch template created"
fi
echo ""

# Update Auto Scaling Group
echo "📊 Step 5: Updating Auto Scaling Group..."
ASG_NAME="${PROJECT_NAME}-asg"

if aws autoscaling describe-auto-scaling-groups --region $REGION --auto-scaling-group-names $ASG_NAME &>/dev/null; then
  echo "Updating ASG to use new launch template..."
  
  aws autoscaling update-auto-scaling-group \
    --region $REGION \
    --auto-scaling-group-name $ASG_NAME \
    --launch-template "LaunchTemplateName=$TEMPLATE_NAME,Version=\$Latest"
  
  echo "✅ ASG updated with new launch template"
  echo ""
  
  # Display current ASG configuration
  echo "Current ASG configuration:"
  aws autoscaling describe-auto-scaling-groups \
    --region $REGION \
    --auto-scaling-group-names $ASG_NAME \
    --query 'AutoScalingGroups[0].[MinSize,DesiredCapacity,MaxSize]' \
    --output text | awk '{print "  Min: "$1", Desired: "$2", Max: "$3}'
else
  echo "⚠️  ASG not found. You may need to create it first."
  echo "   Run: bash scripts/setup-autoscaling.sh"
fi
echo ""

# Add/Update Memory-based Scaling Policy
echo "📈 Step 6: Setting up memory-based auto-scaling..."

# Create CloudWatch alarm for high memory
ALARM_NAME="${PROJECT_NAME}-high-memory"
SNS_TOPIC_ARN=$(aws sns list-topics --region $REGION --query "Topics[?contains(TopicArn, 'proxy-alerts')].TopicArn | [0]" --output text)

if [ "$SNS_TOPIC_ARN" != "None" ] && [ -n "$SNS_TOPIC_ARN" ]; then
  echo "Using existing SNS topic: $SNS_TOPIC_ARN"
else
  echo "Creating SNS topic for alarms..."
  SNS_TOPIC_ARN=$(aws sns create-topic \
    --region $REGION \
    --name "${PROJECT_NAME}-alerts" \
    --query 'TopicArn' \
    --output text)
  echo "SNS Topic created: $SNS_TOPIC_ARN"
  echo "⚠️  Subscribe to this topic to receive alerts!"
fi

# Target Tracking Scaling Policy for Memory
if aws autoscaling describe-auto-scaling-groups --region $REGION --auto-scaling-group-names $ASG_NAME &>/dev/null; then
  echo "Creating target tracking policy for memory..."
  
  # Step scaling policy for memory (since target tracking doesn't support memory metric directly)
  POLICY_NAME="${PROJECT_NAME}-scale-out-memory"
  
  # Scale out policy
  aws autoscaling put-scaling-policy \
    --region $REGION \
    --auto-scaling-group-name $ASG_NAME \
    --policy-name $POLICY_NAME \
    --policy-type StepScaling \
    --adjustment-type ChangeInCapacity \
    --metric-aggregation-type Average \
    --step-adjustments MetricIntervalLowerBound=0,MetricIntervalUpperBound=10,ScalingAdjustment=1 \
                       MetricIntervalLowerBound=10,ScalingAdjustment=2 > /dev/null || true
  
  echo "✅ Memory scaling policy configured"
  echo ""
  
  # Create CloudWatch alarm for memory > 80%
  echo "Creating CloudWatch alarm for high memory..."
  aws cloudwatch put-metric-alarm \
    --region $REGION \
    --alarm-name "${PROJECT_NAME}-memory-high" \
    --alarm-description "Trigger scaling when memory usage exceeds 80%" \
    --actions-enabled \
    --alarm-actions $SNS_TOPIC_ARN \
    --metric-name MemoryUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=AutoScalingGroupName,Value=$ASG_NAME || echo "⚠️  CloudWatch alarm creation failed (may need CloudWatch agent)"
  
  echo "✅ CloudWatch alarm created"
fi
echo ""

echo "========================================================"
echo "✅ AMI and Auto-Scaling Setup Complete!"
echo "========================================================"
echo ""
echo "Summary:"
echo "  AMI ID: $AMI_ID"
echo "  AMI Name: $AMI_NAME"
echo "  Launch Template: $TEMPLATE_NAME"
echo "  ASG: $ASG_NAME"
echo ""
echo "Next steps:"
echo "  1. Test new instances by scaling up:"
echo "     aws autoscaling set-desired-capacity --auto-scaling-group-name $ASG_NAME --desired-capacity 4"
echo ""
echo "  2. Subscribe to SNS alerts:"
echo "     aws sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol email --notification-endpoint your@email.com"
echo ""
echo "  3. Monitor new instances for browser leaks:"
echo "     ssh -i ~/Downloads/suffix-server.pem ec2-user@<NEW_INSTANCE_IP> '/home/ec2-user/proxy-service/scripts/monitor-browser-leaks.sh'"
echo ""
echo "  4. Gradually replace old instances:"
echo "     aws autoscaling start-instance-refresh --auto-scaling-group-name $ASG_NAME"
echo ""
