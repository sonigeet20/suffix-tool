#!/bin/bash

# Update script for proxy service on EC2
# Usage: ./update-ec2.sh

EC2_IP="54.196.154.138"
KEY_PATH="$HOME/.ssh/url-tracker-key.pem"

echo "📦 Uploading updated server.js to EC2..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  server.js ec2-user@${EC2_IP}:~/proxy-service/

if [ $? -eq 0 ]; then
  echo "✅ Upload successful"
  echo "🔄 Restarting PM2 service..."
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ec2-user@${EC2_IP} << 'EOF'
    cd ~/proxy-service
    pm2 restart proxy-service
    echo "✅ Service restarted"
    sleep 2
    pm2 logs proxy-service --lines 20 --nostream
EOF
else
  echo "❌ Upload failed"
  exit 1
fi
