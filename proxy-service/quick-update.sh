#!/bin/bash

# Quick update script for AWS proxy service
# Usage: ./quick-update.sh YOUR_KEY.pem

KEY_FILE=$1
AWS_HOST="ubuntu@13.221.79.118"

if [ -z "$KEY_FILE" ]; then
  echo "Usage: ./quick-update.sh YOUR_KEY.pem"
  exit 1
fi

echo "📦 Uploading server.js to AWS..."
scp -i "$KEY_FILE" server.js "$AWS_HOST:/opt/url-tracker-proxy/"

echo "🔄 Restarting service..."
ssh -i "$KEY_FILE" "$AWS_HOST" "cd /opt/url-tracker-proxy && pm2 restart proxy-service"

echo "📊 Checking logs..."
ssh -i "$KEY_FILE" "$AWS_HOST" "pm2 logs proxy-service --lines 20 --nostream"

echo "✅ Deployment complete!"
