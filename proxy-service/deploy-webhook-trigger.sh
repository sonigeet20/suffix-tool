#!/bin/bash

# Simple deployment script - uploads only changed files
# No git required

set -e

echo "🚀 WEBHOOK-TRIGGER DEPLOYMENT (Direct Upload)"
echo "=============================================="

# EC2 instances
INSTANCES=("44.199.188.191" "44.222.241.126" "18.204.34.238")
KEY_PATH="$HOME/Downloads/suffix-server.pem"

if [ ! -f "$KEY_PATH" ]; then
  echo "❌ SSH key not found at $KEY_PATH"
  exit 1
fi

chmod 600 "$KEY_PATH"

for EC2_IP in "${INSTANCES[@]}"; do
  echo ""
  echo "📦 Deploying to $EC2_IP..."
  
  # Upload changed files
  echo "📤 Uploading trackier-webhook.js..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
    routes/trackier-webhook.js ec2-user@${EC2_IP}:~/proxy-service/routes/
  
  echo "📤 Uploading ecosystem.config.js..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
    ecosystem.config.js ec2-user@${EC2_IP}:~/proxy-service/
  
  echo "📤 Uploading package.json..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
    package.json ec2-user@${EC2_IP}:~/proxy-service/
  
  # Restart with safety checks
  echo "🔄 Restarting PM2..."
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ec2-user@${EC2_IP} << 'RESTART_SCRIPT'
set -e
cd ~/proxy-service

# Verify files are in place
echo "🔍 Verifying files..."
[ -f "routes/trackier-webhook.js" ] && echo "✅ trackier-webhook.js found"
[ -f "ecosystem.config.js" ] && echo "✅ ecosystem.config.js found"

# Install dependencies (safe)
echo "📚 Installing dependencies..."
npm install --production 2>/dev/null || true

# Gracefully reload PM2
echo "🔄 Reloading PM2..."
pm2 delete proxy-service 2>/dev/null || true
sleep 2
pm2 start ecosystem.config.js --only proxy-service

# Wait for service to stabilize
echo "⏳ Waiting 5 seconds..."
sleep 5

# Check status
echo "🏃 PM2 Status:"
pm2 status proxy-service || true

# Check restart count
RESTARTS=$(pm2 status proxy-service | grep -oP 'restarts\s+\|\s+\K\d+' || echo "0")
echo "Current restarts: $RESTARTS"

if [ "$RESTARTS" -gt 5 ]; then
  echo "❌ Too many restarts - service may have issues"
  echo "📋 Recent logs:"
  pm2 logs proxy-service --lines 20 --nostream || true
  exit 1
fi

echo "✅ Service restarted successfully on $EC2_IP"

RESTART_SCRIPT

  if [ $? -ne 0 ]; then
    echo "❌ Deployment failed on $EC2_IP"
    exit 1
  fi
done

echo ""
echo "✅ ALL INSTANCES DEPLOYED SUCCESSFULLY"
echo "======================================"
echo ""
echo "✅ Webhook trigger system is now active:"
echo "   - Edge Function: Listens for Trackier webhooks"
echo "   - Backend: /api/trackier-trace-background processes traces"
echo "   - All instances: Running with restart safety limits"
echo ""
echo "Next: Click tracking URL and verify webhook → trace flow"
echo ""
