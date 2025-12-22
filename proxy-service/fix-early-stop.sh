#!/bin/bash

# Speed optimization deployment
# Deploys optimized server.js with adaptive smart detection
# Target: Sub-5s for simple redirects, sub-7s for JS redirects

if [ -z "$1" ]; then
  echo "Usage: ./fix-early-stop.sh YOUR_EC2_IP"
  echo ""
  echo "Example: ./fix-early-stop.sh ec2-12-34-56-78.compute-1.amazonaws.com"
  exit 1
fi

EC2_HOST="$1"

echo "📦 Uploading fixed server.js to $EC2_HOST..."
scp server.js ec2-user@$EC2_HOST:/home/ec2-user/proxy-service/server.js

if [ $? -ne 0 ]; then
  echo "❌ Upload failed. Check your SSH connection."
  exit 1
fi

echo "✅ Upload successful!"
echo ""
echo "🔄 Restarting proxy service..."
ssh ec2-user@$EC2_HOST "pm2 restart proxy-service"

if [ $? -ne 0 ]; then
  echo "❌ Restart failed."
  exit 1
fi

echo "✅ Service restarted!"
echo ""
echo "📊 Viewing logs (Ctrl+C to exit)..."
sleep 2
ssh ec2-user@$EC2_HOST "pm2 logs proxy-service --lines 30"
