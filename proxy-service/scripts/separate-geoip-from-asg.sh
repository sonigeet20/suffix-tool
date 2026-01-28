#!/bin/bash
# Separate GeoIP Service Instance from ASG/ALB
# This script removes the instance from auto-scaling and configures it as standalone

set -e

GEOIP_INSTANCE_ID="${GEOIP_INSTANCE_ID}"  # Get from AWS console
ASG_NAME="${ASG_NAME}"                    # Your current Auto Scaling Group name
REGION="${AWS_REGION:-us-east-1}"

if [ -z "$GEOIP_INSTANCE_ID" ]; then
  echo "ERROR: GEOIP_INSTANCE_ID not set"
  echo "Usage: GEOIP_INSTANCE_ID=i-xxxxx ASG_NAME=proxy-asg bash $0"
  exit 1
fi

echo "========================================="
echo "Separating GeoIP Instance from ASG/ALB"
echo "========================================="
echo ""
echo "Instance ID: $GEOIP_INSTANCE_ID"
echo "ASG: $ASG_NAME"
echo "Region: $REGION"
echo ""

# Step 1: Remove from ASG
echo "Step 1: Removing instance from Auto Scaling Group..."
aws autoscaling terminate-instance-in-auto-scaling-group \
  --instance-id "$GEOIP_INSTANCE_ID" \
  --region "$REGION" \
  --should-decrement-desired-capacity || echo "Already removed or not in ASG"

echo "✓ Instance removed from ASG"
echo ""

# Step 2: Allocate Elastic IP (if not already assigned)
echo "Step 2: Checking for Elastic IP..."
ELASTIC_IP=$(aws ec2 describe-addresses \
  --region "$REGION" \
  --query "Addresses[?InstanceId=='$GEOIP_INSTANCE_ID'].PublicIp" \
  --output text)

if [ -z "$ELASTIC_IP" ]; then
  echo "Allocating new Elastic IP..."
  ALLOCATION=$(aws ec2 allocate-address \
    --region "$REGION" \
    --domain vpc \
    --output text)
  
  ALLOCATION_ID=$(echo "$ALLOCATION" | awk '{print $1}')
  ELASTIC_IP=$(echo "$ALLOCATION" | awk '{print $2}')
  
  echo "Assigning Elastic IP to instance..."
  aws ec2 associate-address \
    --instance-id "$GEOIP_INSTANCE_ID" \
    --allocation-id "$ALLOCATION_ID" \
    --region "$REGION"
  
  echo "✓ Elastic IP allocated: $ELASTIC_IP"
else
  echo "✓ Already has Elastic IP: $ELASTIC_IP"
fi

echo ""

# Step 3: Update security group
echo "Step 3: Updating security group..."
SECURITY_GROUP=$(aws ec2 describe-instances \
  --instance-ids "$GEOIP_INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

echo "Security Group: $SECURITY_GROUP"

# Check if port 3001 is allowed
INGRESS_RULE=$(aws ec2 describe-security-groups \
  --group-ids "$SECURITY_GROUP" \
  --region "$REGION" \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`3001\`]" \
  --output text || echo "")

if [ -z "$INGRESS_RULE" ]; then
  echo "Adding ingress rule for port 3001..."
  
  # Get VPC CIDR for internal traffic
  VPC_ID=$(aws ec2 describe-instances \
    --instance-ids "$GEOIP_INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].VpcId' \
    --output text)
  
  VPC_CIDR=$(aws ec2 describe-vpcs \
    --vpc-ids "$VPC_ID" \
    --region "$REGION" \
    --query 'Vpcs[0].CidrBlock' \
    --output text)
  
  aws ec2 authorize-security-group-ingress \
    --group-id "$SECURITY_GROUP" \
    --region "$REGION" \
    --protocol tcp \
    --port 3001 \
    --cidr "$VPC_CIDR" \
    --description "GeoIP Service - internal VPC traffic"
  
  echo "✓ Ingress rule added for port 3001"
else
  echo "✓ Port 3001 already allowed"
fi

echo ""

# Step 4: Tag instance
echo "Step 4: Tagging instance..."
aws ec2 create-tags \
  --resources "$GEOIP_INSTANCE_ID" \
  --region "$REGION" \
  --tags "Key=Name,Value=geoip-service" \
          "Key=Purpose,Value=dedicated-geoip" \
          "Key=AutoScaling,Value=disabled" || echo "Tags may already exist"

echo "✓ Instance tagged"
echo ""

# Step 5: Create monitoring
echo "Step 5: Setting up monitoring..."
echo "Consider setting up:"
echo "  - CloudWatch alarms for CPU/Memory"
echo "  - Automatic instance recovery if unhealthy"
echo "  - AWS Systems Manager for patch management"
echo ""

echo "========================================="
echo "✓ GeoIP Instance Separated!"
echo "========================================="
echo ""
echo "Instance Details:"
echo "  ID: $GEOIP_INSTANCE_ID"
echo "  Elastic IP: $ELASTIC_IP"
echo "  Service URL: http://$ELASTIC_IP:3001"
echo ""
echo "Next Steps:"
echo "1. Deploy GeoIP service:"
echo "   export GEOIP_INSTANCE_IP=$ELASTIC_IP"
echo "   bash proxy-service/scripts/deploy-geoip-service.sh"
echo ""
echo "2. Update proxy instances to use new IP:"
echo "   export GEOIP_SERVICE_URL=http://$ELASTIC_IP:3001"
echo "   bash proxy-service/scripts/deploy-google-ads.sh"
echo ""
echo "3. Monitor the instance:"
echo "   aws ec2 describe-instances --instance-ids $GEOIP_INSTANCE_ID --region $REGION"
echo ""
