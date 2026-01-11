#!/bin/bash

# STARTUP VALIDATION SCRIPT
# Purpose: Ensure only ONE proxy-service process runs, prevent port conflicts
# Run after server restarts or during deployment

echo "🔍 Validating proxy-service startup..."

# 1. KILL EXISTING PROCESSES
echo "   ➜ Checking for duplicate processes..."
existing_services=$(pm2 list 2>/dev/null | grep -E "proxy-service|proxy-server" | wc -l)
if [ "$existing_services" -gt 1 ]; then
  echo "   ⚠️  Multiple processes found! Cleaning up..."
  pm2 delete all
  sudo pkill -9 node
  sleep 2
fi

# 2. VALIDATE PORT NOT IN USE
echo "   ➜ Checking port 3000..."
if lsof -i :3000 >/dev/null 2>&1; then
  echo "   ⚠️  Port 3000 already in use! Killing process..."
  sudo fuser -k 3000/tcp || true
  sleep 1
fi

# 3. START CLEAN PROCESS
echo "   ➜ Starting proxy-service..."
cd ~/proxy-service
pm2 start ecosystem.config.js --only proxy-service 2>/dev/null || pm2 start server.js --name proxy-service
pm2 save

# 4. VERIFY STARTUP
sleep 3
processes=$(pm2 list 2>/dev/null | grep "proxy-service" | grep "online" | wc -l)
if [ "$processes" -eq 1 ]; then
  echo "   ✅ Startup validation PASSED"
  echo "      - Single proxy-service process running"
  echo "      - Port 3000 reserved"
  curl -s http://localhost:3000/api/trackier-status >/dev/null && echo "      - API responding"
  exit 0
else
  echo "   ❌ Startup validation FAILED"
  echo "      - Expected 1 process, found: $processes"
  pm2 status
  exit 1
fi
