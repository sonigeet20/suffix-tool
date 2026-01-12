#!/bin/bash

# AWS Architecture Check Script
# This gathers all necessary information for NAT Gateway setup

echo "════════════════════════════════════════════════════════════════════════════════"
echo "                    🔍 AWS ARCHITECTURE CHECK"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Check if AWS CLI is configured
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   brew install awscli"
    exit 1
fi

# Check credentials
echo "📍 Step 1: Verifying AWS credentials..."
aws sts get-caller-identity > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ AWS credentials not configured"
    echo "   Run: aws configure"
    exit 1
fi
echo "✅ AWS credentials valid"
echo ""

# Get VPCs
echo "📍 Step 2: Finding VPCs..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,CidrBlock,IsDefault]' --output text | while read vpc cidr is_default; do
    echo "VPC ID: $vpc"
    echo "  CIDR: $cidr"
    echo "  Default: $is_default"
    echo ""
done
echo ""

# Get Subnets
echo "📍 Step 3: Finding Subnets..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws ec2 describe-subnets --query 'Subnets[*].[SubnetId,CidrBlock,MapPublicIpOnLaunch,AvailabilityZone,VpcId]' --output text | while read subnet cidr public az vpc; do
    if [ "$public" = "True" ]; then
        subnet_type="PUBLIC"
    else
        subnet_type="PRIVATE"
    fi
    echo "Subnet ID: $subnet ($subnet_type)"
    echo "  CIDR: $cidr"
    echo "  AZ: $az"
    echo "  VPC: $vpc"
    echo ""
done
echo ""

# Get Load Balancers
echo "📍 Step 4: Finding Load Balancers..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,DNSName,VpcId,Scheme]' --output text 2>/dev/null | while read name dns vpc scheme; do
    echo "Load Balancer: $name"
    echo "  DNS: $dns"
    echo "  VPC: $vpc"
    echo "  Scheme: $scheme"
    
    # Get subnets for this LB
    lb_arn=$(aws elbv2 describe-load-balancers --names "$name" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
    echo "  Subnets:"
    aws elbv2 describe-load-balancers --load-balancer-arns "$lb_arn" --query 'LoadBalancers[0].AvailabilityZones[*].[SubnetId,ZoneName]' --output text | while read subnet_id zone; do
        echo "    - $subnet_id ($zone)"
    done
    echo ""
done
echo ""

# Get EC2 Instances
echo "📍 Step 5: Finding EC2 Instances..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].[InstanceId,PublicIpAddress,PrivateIpAddress,SubnetId,VpcId]' --output text | while read instance public private subnet vpc; do
    echo "Instance: $instance"
    echo "  Public IP: $public"
    echo "  Private IP: $private"
    echo "  Subnet: $subnet"
    echo "  VPC: $vpc"
    echo ""
done
echo ""

# Get Route Tables
echo "📍 Step 6: Checking Route Tables..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws ec2 describe-route-tables --query 'RouteTables[*].[RouteTableId,VpcId]' --output text | while read rtb vpc; do
    echo "Route Table: $rtb (VPC: $vpc)"
    
    # Get associated subnets
    subnets=$(aws ec2 describe-route-tables --route-table-ids "$rtb" --query 'RouteTables[0].Associations[*].SubnetId' --output text)
    if [ -n "$subnets" ]; then
        echo "  Associated subnets: $subnets"
    else
        echo "  Associated subnets: Main route table (default for VPC)"
    fi
    
    # Get routes
    echo "  Routes:"
    aws ec2 describe-route-tables --route-table-ids "$rtb" --query 'RouteTables[0].Routes[*].[DestinationCidrBlock,GatewayId,NatGatewayId]' --output text | while read dest gw nat; do
        if [ -n "$nat" ] && [ "$nat" != "None" ]; then
            echo "    - $dest → $nat (NAT Gateway)"
        elif [ -n "$gw" ] && [ "$gw" != "None" ]; then
            if [[ "$gw" == igw-* ]]; then
                echo "    - $dest → $gw (Internet Gateway)"
            else
                echo "    - $dest → $gw"
            fi
        fi
    done
    echo ""
done
echo ""

# Summary
echo "════════════════════════════════════════════════════════════════════════════════"
echo "                          📊 SUMMARY & NEXT STEPS"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "To proceed with NAT Gateway setup, I need:"
echo ""
echo "1️⃣  VPC ID (where your EC2 instances are)"
echo "2️⃣  Public Subnet ID (for NAT Gateway - must have IGW route)"
echo "3️⃣  EC2 Subnet ID (where instances currently are)"
echo "4️⃣  Route Table ID (for EC2 subnet)"
echo ""
echo "Copy the IDs from above and provide them to continue."
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
