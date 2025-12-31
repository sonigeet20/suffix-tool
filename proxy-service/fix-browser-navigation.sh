#!/bin/bash

# Quick fix for browser navigation errors
# This script updates the proxy service on EC2 with the navigation fix

set -e

echo "🔧 Fixing browser navigation errors..."

# Check if EC2 host is provided
if [ -z "$1" ]; then
  echo "❌ Error: Please provide EC2 host"
  echo "Usage: ./fix-browser-navigation.sh ec2-user@your-ec2-ip"
  exit 1
fi

EC2_HOST=$1

echo "📤 Uploading fixed server.js to $EC2_HOST..."
scp server.js $EC2_HOST:/home/ec2-user/proxy-service/server.js

echo "🔄 Restarting proxy service..."
ssh $EC2_HOST "pm2 restart proxy-service"

echo "✅ Fix deployed! Monitoring logs..."
ssh $EC2_HOST "pm2 logs proxy-service --lines 50"
