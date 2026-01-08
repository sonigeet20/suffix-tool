#!/bin/bash
set -e

echo "🔧 Deploying Browser Leak Fix to All ASG Instances"
echo "=================================================="
echo ""

# Current fixed instance
FIXED_INSTANCE="44.203.80.146"

# Get other instances from deploy-all.sh (update these if different)
INSTANCE_1_IP="18.204.4.188"
INSTANCE_1_ID="i-03ea38b1268e76630"

INSTANCE_2_IP="3.231.93.225"
INSTANCE_2_ID="i-024d1125dae88ceb4"

INSTANCE_3_IP="98.92.34.34"
INSTANCE_3_ID="i-055f78c26e6ed2d4a"

KEY_FILE="~/Downloads/suffix-server.pem"

cd "$(dirname "$0")"

echo "📦 Step 1: Deploying fixed server.js to all instances..."
echo ""

# Deploy to Instance 1
echo "  → Deploying to $INSTANCE_1_ID ($INSTANCE_1_IP)..."
if scp -i $KEY_FILE -o StrictHostKeyChecking=no server.js ec2-user@$INSTANCE_1_IP:~/proxy-service/ 2>/dev/null; then
  ssh -i $KEY_FILE ec2-user@$INSTANCE_1_IP 'cd proxy-service && pm2 restart proxy-server' 2>/dev/null
  echo "    ✅ Updated and restarted"
else
  echo "    ⚠️  Failed to deploy (instance may be terminated)"
fi
echo ""

# Deploy to Instance 2
echo "  → Deploying to $INSTANCE_2_ID ($INSTANCE_2_IP)..."
if scp -i $KEY_FILE -o StrictHostKeyChecking=no server.js ec2-user@$INSTANCE_2_IP:~/proxy-service/ 2>/dev/null; then
  ssh -i $KEY_FILE ec2-user@$INSTANCE_2_IP 'cd proxy-service && pm2 restart proxy-server' 2>/dev/null
  echo "    ✅ Updated and restarted"
else
  echo "    ⚠️  Failed to deploy (instance may be terminated)"
fi
echo ""

# Deploy to Instance 3  
echo "  → Deploying to $INSTANCE_3_ID ($INSTANCE_3_IP)..."
if scp -i $KEY_FILE -o StrictHostKeyChecking=no server.js ec2-user@$INSTANCE_3_IP:~/proxy-service/ 2>/dev/null; then
  ssh -i $KEY_FILE ec2-user@$INSTANCE_3_IP 'cd proxy-service && pm2 restart proxy-server' 2>/dev/null
  echo "    ✅ Updated and restarted"
else
  echo "    ⚠️  Failed to deploy (instance may be terminated)"
fi
echo ""

echo "📦 Step 2: Deploying monitoring script to all instances..."
echo ""

# Deploy monitoring script to Instance 1
echo "  → Deploying monitor to $INSTANCE_1_IP..."
if ssh -i $KEY_FILE ec2-user@$INSTANCE_1_IP 'mkdir -p ~/proxy-service/scripts' 2>/dev/null; then
  scp -i $KEY_FILE -o StrictHostKeyChecking=no scripts/monitor-browser-leaks.sh ec2-user@$INSTANCE_1_IP:~/proxy-service/scripts/ 2>/dev/null
  ssh -i $KEY_FILE ec2-user@$INSTANCE_1_IP 'chmod +x ~/proxy-service/scripts/monitor-browser-leaks.sh' 2>/dev/null
  echo "    ✅ Monitor deployed"
else
  echo "    ⚠️  Failed"
fi

# Deploy monitoring script to Instance 2
echo "  → Deploying monitor to $INSTANCE_2_IP..."
if ssh -i $KEY_FILE ec2-user@$INSTANCE_2_IP 'mkdir -p ~/proxy-service/scripts' 2>/dev/null; then
  scp -i $KEY_FILE -o StrictHostKeyChecking=no scripts/monitor-browser-leaks.sh ec2-user@$INSTANCE_2_IP:~/proxy-service/scripts/ 2>/dev/null
  ssh -i $KEY_FILE ec2-user@$INSTANCE_2_IP 'chmod +x ~/proxy-service/scripts/monitor-browser-leaks.sh' 2>/dev/null
  echo "    ✅ Monitor deployed"
else
  echo "    ⚠️  Failed"
fi

# Deploy monitoring script to Instance 3
echo "  → Deploying monitor to $INSTANCE_3_IP..."
if ssh -i $KEY_FILE ec2-user@$INSTANCE_3_IP 'mkdir -p ~/proxy-service/scripts' 2>/dev/null; then
  scp -i $KEY_FILE -o StrictHostKeyChecking=no scripts/monitor-browser-leaks.sh ec2-user@$INSTANCE_3_IP:~/proxy-service/scripts/ 2>/dev/null
  ssh -i $KEY_FILE ec2-user@$INSTANCE_3_IP 'chmod +x ~/proxy-service/scripts/monitor-browser-leaks.sh' 2>/dev/null
  echo "    ✅ Monitor deployed"
else
  echo "    ⚠️  Failed"
fi

echo ""
echo "🔍 Step 3: Checking Chrome process counts..."
echo ""

for IP in $INSTANCE_1_IP $INSTANCE_2_IP $INSTANCE_3_IP; do
  echo "  → $IP:"
  if ssh -i $KEY_FILE ec2-user@$IP "ps aux | grep 'chrome --allow-pre-commit' | grep -v grep | wc -l" 2>/dev/null; then
    :
  else
    echo "    ⚠️  Cannot connect"
  fi
done

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Run: bash proxy-service/scripts/create-ami-and-update-asg.sh"
echo "  2. This will create new AMI and update launch template"
