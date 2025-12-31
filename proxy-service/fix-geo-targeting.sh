#!/bin/bash
# Fix geo-targeting on AWS EC2

SERVER_IP="13.221.79.118"
KEY_PATH="$1"

if [ -z "$KEY_PATH" ]; then
  echo "Usage: ./fix-geo-targeting.sh /path/to/your-key.pem"
  exit 1
fi

echo "🔄 Uploading updated server.js..."
scp -i "$KEY_PATH" server.js ubuntu@$SERVER_IP:/opt/url-tracker-proxy/server.js

echo "🔄 Restarting PM2..."
ssh -i "$KEY_PATH" ubuntu@$SERVER_IP "cd /opt/url-tracker-proxy && pm2 restart proxy-service"

echo "⏳ Waiting 3 seconds..."
sleep 3

echo "📊 Checking logs..."
ssh -i "$KEY_PATH" ubuntu@$SERVER_IP "pm2 logs proxy-service --lines 10 --nostream"

echo ""
echo "✅ Done! Test with target_country='US' to verify geo-targeting"
