#!/bin/bash

# SIMPLE PM2 INITIALIZATION
# For new instances or first-time setup
# Usage: bash scripts/init-pm2.sh

echo "🚀 Initializing PM2 for proxy-service..."

# 1. Clean slate - remove all existing processes
echo "   Cleaning old processes..."
pm2 delete all 2>/dev/null || true
sudo pkill -9 node 2>/dev/null || true
sleep 2

# 2. Start the ONE service with restart limit
echo "   Starting proxy-service from server.js..."
cd ~/proxy-service
pm2 start server.js --name proxy-service --max-restarts 10 --min-uptime 10000

# 3. Save PM2 state
pm2 save

# 4. Setup PM2 to start on system boot
pm2 startup | tail -1 | bash 2>/dev/null || true

# 5. Verify
echo ""
echo "✅ Setup complete:"
pm2 status | grep proxy-service
