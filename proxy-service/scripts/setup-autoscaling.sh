#!/bin/bash

# Auto-Scaling Setup Script for Proxy Service
# This script sets up complete auto-scaling infrastructure with load balancer

set -e

INSTANCE_ID="${INSTANCE_ID:-i-03ea38b1268e76630}"
REGION="${AWS_REGION:-us-east-1}"
PROJECT_NAME="url-tracker-proxy"
AMI_NAME="${PROJECT_NAME}-ami-$(date +%Y%m%d-%H%M%S)"

echo "🚀 Starting Auto-Scaling Setup"
echo "Instance ID: $INSTANCE_ID"
echo "Region: $REGION"

# Step 1: Enable termination protection
echo ""
echo "📌 Step 1: Enabling termination protection..."
aws ec2 modify-instance-attribute \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --disable-api-termination || echo "⚠️  Already protected or failed"

# Get instance details
echo ""
echo "🔍 Getting instance configuration..."
INSTANCE_INFO=$(aws ec2 describe-instances \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0]')

INSTANCE_TYPE=$(echo $INSTANCE_INFO | jq -r '.InstanceType')
SECURITY_GROUP=$(echo $INSTANCE_INFO | jq -r '.SecurityGroups[0].GroupId')
SUBNET_ID=$(echo $INSTANCE_INFO | jq -r '.SubnetId')
KEY_NAME=$(echo $INSTANCE_INFO | jq -r '.KeyName')
VPC_ID=$(echo $INSTANCE_INFO | jq -r '.VpcId')
AZ=$(echo $INSTANCE_INFO | jq -r '.Placement.AvailabilityZone')

echo "Instance Type: $INSTANCE_TYPE"
echo "Security Group: $SECURITY_GROUP"
echo "Subnet: $SUBNET_ID"
echo "VPC: $VPC_ID"
echo "AZ: $AZ"
echo "Key: $KEY_NAME"

# Get all subnets in this VPC for load balancer
echo ""
echo "🌐 Getting VPC subnets..."
SUBNETS=$(aws ec2 describe-subnets \
  --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone]' \
  --output text)

# Get at least 2 subnets in different AZs (required for ALB)
SUBNET_IDS=$(echo "$SUBNETS" | awk '{print $1}' | head -2 | tr '\n' ' ')
echo "Subnets for ALB: $SUBNET_IDS"

# Step 2: Create AMI from current instance
echo ""
echo "📸 Step 2: Creating AMI (this may take 5-10 minutes)..."
AMI_ID=$(aws ec2 create-image \
  --region $REGION \
  --instance-id $INSTANCE_ID \
  --name "$AMI_NAME" \
  --description "Proxy service with all dependencies - $(date)" \
  --no-reboot \
  --query 'ImageId' \
  --output text)

echo "AMI ID: $AMI_ID"
echo "Waiting for AMI to be available..."
aws ec2 wait image-available --region $REGION --image-ids $AMI_ID
echo "✅ AMI created successfully!"

# Step 3: Create Launch Template
echo ""
echo "🚀 Step 3: Creating Launch Template..."

USER_DATA=$(cat <<'EOF'
#!/bin/bash
cd /home/ec2-user/proxy-service
pm2 start server.js --name proxy-server --log /home/ec2-user/proxy-service/logs/pm2.log
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user
EOF
)

USER_DATA_BASE64=$(echo "$USER_DATA" | base64)

LAUNCH_TEMPLATE_ID=$(aws ec2 create-launch-template \
  --region $REGION \
  --launch-template-name "${PROJECT_NAME}-template" \
  --launch-template-data "{
    \"ImageId\": \"$AMI_ID\",
    \"InstanceType\": \"$INSTANCE_TYPE\",
    \"KeyName\": \"$KEY_NAME\",
    \"SecurityGroupIds\": [\"$SECURITY_GROUP\"],
    \"UserData\": \"$USER_DATA_BASE64\",
    \"TagSpecifications\": [{
      \"ResourceType\": \"instance\",
      \"Tags\": [{\"Key\": \"Name\", \"Value\": \"${PROJECT_NAME}-auto\"}, {\"Key\": \"ManagedBy\", \"Value\": \"AutoScaling\"}]
    }]
  }" \
  --query 'LaunchTemplate.LaunchTemplateId' \
  --output text)

echo "Launch Template ID: $LAUNCH_TEMPLATE_ID"
echo "✅ Launch Template created!"

# Step 4: Create Target Group
echo ""
echo "🎯 Step 4: Creating Target Group..."

TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
  --region $REGION \
  --name "${PROJECT_NAME}-tg" \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --health-check-enabled \
  --health-check-protocol HTTP \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

echo "Target Group ARN: $TARGET_GROUP_ARN"

# Register existing instance to target group
echo "Registering existing instance to target group..."
aws elbv2 register-targets \
  --region $REGION \
  --target-group-arn $TARGET_GROUP_ARN \
  --targets Id=$INSTANCE_ID

echo "✅ Target Group created and instance registered!"

# Step 5: Create Application Load Balancer
echo ""
echo "⚖️  Step 5: Creating Application Load Balancer..."

ALB_ARN=$(aws elbv2 create-load-balancer \
  --region $REGION \
  --name "${PROJECT_NAME}-alb" \
  --subnets $SUBNET_IDS \
  --security-groups $SECURITY_GROUP \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

echo "ALB ARN: $ALB_ARN"

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --region $REGION \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "ALB DNS: $ALB_DNS"

# Create listener on port 80
echo "Creating HTTP listener on port 80..."
LISTENER_ARN=$(aws elbv2 create-listener \
  --region $REGION \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN \
  --query 'Listeners[0].ListenerArn' \
  --output text)

echo "Listener ARN: $LISTENER_ARN"
echo "✅ Load Balancer created!"

# Wait for ALB to be active
echo "Waiting for Load Balancer to become active..."
aws elbv2 wait load-balancer-available --region $REGION --load-balancer-arns $ALB_ARN
echo "✅ Load Balancer is active!"

# Step 6: Create Auto Scaling Group
echo ""
echo "📈 Step 6: Creating Auto Scaling Group..."

ASG_NAME="${PROJECT_NAME}-asg"

aws autoscaling create-auto-scaling-group \
  --region $REGION \
  --auto-scaling-group-name $ASG_NAME \
  --launch-template LaunchTemplateId=$LAUNCH_TEMPLATE_ID,Version='$Latest' \
  --min-size 2 \
  --max-size 5 \
  --desired-capacity 2 \
  --default-cooldown 300 \
  --health-check-type ELB \
  --health-check-grace-period 300 \
  --vpc-zone-identifier "$SUBNET_ID" \
  --target-group-arns $TARGET_GROUP_ARN \
  --tags "Key=Name,Value=${PROJECT_NAME}-instance,PropagateAtLaunch=true" "Key=ManagedBy,Value=AutoScaling,PropagateAtLaunch=true"

echo "✅ Auto Scaling Group created!"

# Step 7: Create Scaling Policies
echo ""
echo "📊 Step 7: Creating CPU-based scaling policies..."

# Scale UP policy
SCALE_UP_POLICY=$(aws autoscaling put-scaling-policy \
  --region $REGION \
  --auto-scaling-group-name $ASG_NAME \
  --policy-name "${PROJECT_NAME}-scale-up" \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration "{
    \"PredefinedMetricSpecification\": {
      \"PredefinedMetricType\": \"ASGAverageCPUUtilization\"
    },
    \"TargetValue\": 50.0
  }" \
  --query 'PolicyARN' \
  --output text)

echo "Scale-up Policy ARN: $SCALE_UP_POLICY"
echo "✅ Scaling policies created!"

# Summary
echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ AUTO-SCALING SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📋 INFRASTRUCTURE DETAILS:"
echo "─────────────────────────────────────────────────────"
echo "Original Instance: $INSTANCE_ID (protected)"
echo "AMI ID: $AMI_ID"
echo "Launch Template: $LAUNCH_TEMPLATE_ID"
echo "Load Balancer: $ALB_DNS"
echo "Target Group: $TARGET_GROUP_ARN"
echo "Auto Scaling Group: $ASG_NAME"
echo "Min Instances: 2"
echo "Max Instances: 5"
echo "Scale Target: 50% CPU"
echo ""
echo "🌐 LOAD BALANCER ENDPOINT:"
echo "   http://$ALB_DNS"
echo ""
echo "📝 NEXT STEPS:"
echo "1. Wait 2-3 minutes for new instances to launch and pass health checks"
echo "2. Update Supabase settings table:"
echo "   aws_proxy_url = 'http://$ALB_DNS'"
echo "3. Test the endpoint:"
echo "   curl http://$ALB_DNS/health"
echo "4. Monitor Auto Scaling Group:"
echo "   aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG_NAME"
echo ""
echo "═══════════════════════════════════════════════════════"
