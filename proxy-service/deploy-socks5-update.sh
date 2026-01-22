#!/bin/bash
#
# Deploy SOCKS5 Proxy Protocol Support Update
# Updates proxy-service files on EC2 instance
#

set -e

INSTANCE_IP=$1
KEY_FILE=${2:-~/Downloads/suffix-server.pem}
SSH_USER=${3:-ec2-user}

if [ -z "$INSTANCE_IP" ]; then
  echo "Usage: $0 <instance-ip> [key-file] [ssh-user]"
  echo "Example: $0 44.211.120.116 ~/Downloads/suffix-server.pem ec2-user"
  exit 1
fi

echo "🚀 Deploying SOCKS5 support to $INSTANCE_IP"
echo "   Key: $KEY_FILE | User: $SSH_USER"
echo "================================================"

# Files to update
FILES=(
  "server.js"
  "trace-interactive.js"
  "lib/proxy-providers-handler.js"
  "package.json"
)

echo ""
echo "📦 Step 1: Copying updated files..."
for file in "${FILES[@]}"; do
  echo "  Copying $file..."
  scp -o StrictHostKeyChecking=no -i "$KEY_FILE" "$file" "${SSH_USER}@${INSTANCE_IP}:/home/${SSH_USER}/proxy-service/$file"
done

echo ""
echo "📦 Step 2: Installing socks-proxy-agent package..."
ssh -o StrictHostKeyChecking=no -i "$KEY_FILE" "${SSH_USER}@${INSTANCE_IP}" << 'EOF'
  cd ~/proxy-service
  npm install socks-proxy-agent --save
  echo "✅ Package installed"
EOF

echo ""
echo "🔄 Step 3: Restarting PM2 service..."
ssh -o StrictHostKeyChecking=no -i "$KEY_FILE" "${SSH_USER}@${INSTANCE_IP}" << 'EOF'
  pm2 restart proxy-service || pm2 start ~/proxy-service/server.js --name proxy-service
  pm2 save
  echo "✅ Service restarted"
EOF

echo ""
echo "🧪 Step 4: Testing deployment..."
sleep 5
ssh -o StrictHostKeyChecking=no -i "$KEY_FILE" "${SSH_USER}@${INSTANCE_IP}" << 'EOF'
  # Check if service is running
  if pm2 list | grep -q "proxy-service.*online"; then
    echo "✅ PM2 service is running"
  else
    echo "❌ PM2 service is not running"
    exit 1
  fi
  
  # Check if port is listening
  if netstat -tuln | grep -q ":3000"; then
    echo "✅ Port 3000 is listening"
  else
    echo "❌ Port 3000 is not listening"
    exit 1
  fi
  
  # Check recent logs for errors
  if pm2 logs proxy-service --lines 20 --nostream | grep -iq "error"; then
    echo "⚠️  Errors found in logs (check manually)"
  else
    echo "✅ No errors in recent logs"
  fi
EOF

echo ""
echo "================================================"
echo "✅ Deployment complete for $INSTANCE_IP"
echo ""
echo "🧪 Test SOCKS5 with:"
echo "   curl -X POST http://${INSTANCE_IP}:3000/trace \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"url\":\"https://blackboxai.partnerlinks.io/pcn4bo8ipzxv\",\"mode\":\"http_only\",\"proxy_protocol\":\"socks5\",\"target_country\":\"in\",\"max_redirects\":20,\"timeout_ms\":30000}'"
echo ""
