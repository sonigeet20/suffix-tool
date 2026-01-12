#!/bin/bash
# AWS NAT Gateway Setup for BrightData IP Whitelisting
# This allows all EC2 instances to share one static IP for outbound traffic

set -e

echo "════════════════════════════════════════════════════════════════"
echo "🔧 NAT Gateway Setup for BrightData Whitelisting"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Configuration
VPC_ID="your-vpc-id"  # Replace with your VPC ID
PUBLIC_SUBNET_ID="your-public-subnet-id"  # Replace with public subnet ID
PRIVATE_SUBNET_ID="your-private-subnet-id"  # Replace with private subnet ID (where EC2 instances are)

echo "📋 Step 1: Allocate Elastic IP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ALLOCATION_ID=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
ELASTIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOCATION_ID --query 'Addresses[0].PublicIp' --output text)
echo "✅ Elastic IP allocated: $ELASTIC_IP"
echo "   Allocation ID: $ALLOCATION_ID"
echo ""

echo "📋 Step 2: Create NAT Gateway"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
NAT_GATEWAY_ID=$(aws ec2 create-nat-gateway \
  --subnet-id $PUBLIC_SUBNET_ID \
  --allocation-id $ALLOCATION_ID \
  --query 'NatGateway.NatGatewayId' \
  --output text)
echo "✅ NAT Gateway created: $NAT_GATEWAY_ID"
echo "   Status: Creating (wait 2-3 minutes)..."
echo ""

echo "📋 Step 3: Waiting for NAT Gateway to become available..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GATEWAY_ID
echo "✅ NAT Gateway is now available"
echo ""

echo "📋 Step 4: Update Route Table for Private Subnet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ROUTE_TABLE_ID=$(aws ec2 describe-route-tables \
  --filters "Name=association.subnet-id,Values=$PRIVATE_SUBNET_ID" \
  --query 'RouteTables[0].RouteTableId' \
  --output text)

if [ "$ROUTE_TABLE_ID" = "None" ]; then
  echo "⚠️  No route table found, creating new one..."
  ROUTE_TABLE_ID=$(aws ec2 create-route-table \
    --vpc-id $VPC_ID \
    --query 'RouteTable.RouteTableId' \
    --output text)
  
  aws ec2 associate-route-table \
    --route-table-id $ROUTE_TABLE_ID \
    --subnet-id $PRIVATE_SUBNET_ID
fi

# Add route to NAT Gateway
aws ec2 create-route \
  --route-table-id $ROUTE_TABLE_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NAT_GATEWAY_ID || echo "   (Route may already exist)"
echo "✅ Route table updated: $ROUTE_TABLE_ID"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "✅ NAT Gateway Setup Complete!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "   • NAT Gateway ID: $NAT_GATEWAY_ID"
echo "   • Elastic IP: $ELASTIC_IP"
echo "   • Route Table ID: $ROUTE_TABLE_ID"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Whitelist this IP in BrightData:"
echo "   Go to: https://brightdata.com/cp/zones"
echo "   Zone: testing_softality_1"
echo "   IP Whitelist: Add $ELASTIC_IP"
echo ""
echo "2. Test from EC2 instance:"
echo "   ssh ubuntu@your-instance"
echo "   curl https://api.ipify.org  # Should return: $ELASTIC_IP"
echo ""
echo "3. Test BrightData proxy:"
echo "   curl --proxy brd.superproxy.io:33335 \\"
echo "     --proxy-user \"brd-customer-hl_a908b07a-zone-testing_softality_1:sugfiq4h5s73\" \\"
echo "     \"https://ipapi.co/json/\""
echo ""
echo "💡 All EC2 instances now share one static IP: $ELASTIC_IP"
echo "   Auto-scaling will work without additional whitelisting!"
echo ""
