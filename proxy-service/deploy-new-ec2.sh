#!/bin/bash
set -e

echo "🚀 Deploying Luna Proxy Service to New EC2 Instance"
echo "=================================================="
echo ""

# Configuration
INSTANCE_NAME="luna-proxy-service"
INSTANCE_TYPE="t3.medium"  # 2 vCPU, 4GB RAM (minimum for Puppeteer)
REGION="us-east-1"
KEY_NAME="url-tracker"  # Use your existing key pair name

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Getting VPC and Subnet information...${NC}"
VPC_ID=$(aws ec2 describe-vpcs --profile url-tracker --region $REGION --query 'Vpcs[0].VpcId' --output text)
echo "✓ VPC ID: $VPC_ID"

SUBNET_ID=$(aws ec2 describe-subnets --profile url-tracker --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[0].SubnetId' --output text)
echo "✓ Subnet ID: $SUBNET_ID"

echo ""
echo -e "${YELLOW}Step 2: Creating Security Group...${NC}"

# Check if security group already exists
SG_ID=$(aws ec2 describe-security-groups --profile url-tracker --region $REGION \
  --filters "Name=group-name,Values=luna-proxy-sg" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ]; then
  echo "Creating new security group..."
  SG_ID=$(aws ec2 create-security-group --profile url-tracker --region $REGION \
    --group-name luna-proxy-sg \
    --description "Security group for Luna Proxy Service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text)

  echo "✓ Created Security Group: $SG_ID"

  # Allow SSH from anywhere (you should restrict this to your IP)
  aws ec2 authorize-security-group-ingress --profile url-tracker --region $REGION \
    --group-id $SG_ID \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0
  echo "✓ Added SSH rule (port 22)"

  # Allow HTTP on port 3000 from anywhere
  aws ec2 authorize-security-group-ingress --profile url-tracker --region $REGION \
    --group-id $SG_ID \
    --protocol tcp \
    --port 3000 \
    --cidr 0.0.0.0/0
  echo "✓ Added HTTP rule (port 3000)"
else
  echo "✓ Using existing Security Group: $SG_ID"
fi

echo ""
echo -e "${YELLOW}Step 3: Finding Ubuntu 22.04 AMI...${NC}"
AMI_ID=$(aws ec2 describe-images --profile url-tracker --region $REGION \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)
echo "✓ AMI ID: $AMI_ID"

echo ""
echo -e "${YELLOW}Step 4: Creating User Data Script...${NC}"

# Create user data script
cat > /tmp/user-data.sh <<'USERDATA'
#!/bin/bash
set -e

echo "Starting Luna Proxy Service installation..."

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Chrome dependencies
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

# Install Chrome
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y ./google-chrome-stable_current_amd64.deb
rm google-chrome-stable_current_amd64.deb

# Install PM2
npm install -g pm2

# Create app directory
mkdir -p /opt/luna-proxy
cd /opt/luna-proxy

# Create package.json
cat > package.json <<'PKG'
{
  "name": "luna-proxy-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "puppeteer": "^22.0.0",
    "axios": "^1.6.0"
  }
}
PKG

# Install dependencies
npm install

echo "Installation complete! Server code will be uploaded separately."
echo "To start the service: cd /opt/luna-proxy && pm2 start server.js"

# Create systemd service for PM2
pm2 startup systemd -u root --hp /root
USERDATA

echo "✓ User data script created"

echo ""
echo -e "${YELLOW}Step 5: Launching EC2 Instance...${NC}"

INSTANCE_ID=$(aws ec2 run-instances --profile url-tracker --region $REGION \
  --image-id $AMI_ID \
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --user-data file:///tmp/user-data.sh \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "✓ Instance launched: $INSTANCE_ID"
echo ""
echo -e "${GREEN}Waiting for instance to start (this may take 2-3 minutes)...${NC}"

aws ec2 wait instance-running --profile url-tracker --region $REGION --instance-ids $INSTANCE_ID

PUBLIC_IP=$(aws ec2 describe-instances --profile url-tracker --region $REGION \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo ""
echo -e "${GREEN}✓ Instance is running!${NC}"
echo ""
echo "=================================================="
echo "Instance Details:"
echo "=================================================="
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo "Instance Type: $INSTANCE_TYPE"
echo "Region: $REGION"
echo ""
echo "=================================================="
echo "Next Steps:"
echo "=================================================="
echo ""
echo "1. Wait 3-5 minutes for the instance to finish initialization"
echo ""
echo "2. Connect via SSH:"
echo "   ssh -i ~/.ssh/url-tracker.pem ubuntu@$PUBLIC_IP"
echo ""
echo "3. Upload server code:"
echo "   scp -i ~/.ssh/url-tracker.pem proxy-service/server.js ubuntu@$PUBLIC_IP:/opt/luna-proxy/"
echo ""
echo "4. Create .env file on the server with Luna credentials"
echo ""
echo "5. Start the service:"
echo "   pm2 start server.js --name luna-proxy"
echo ""
echo "Service URL: http://$PUBLIC_IP:3000"
echo ""
echo "Save this information!"
echo ""
