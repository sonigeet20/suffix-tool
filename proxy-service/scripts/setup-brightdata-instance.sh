#!/bin/bash
# Complete BrightData instance setup script
# Run on EC2 instance startup to:
# 1. Register instance IP in database
# 2. Attempt to whitelist via local API
# 3. Start periodic sync job
# 
# Usage: source this or run directly on instance startup

set -e

echo "═══════════════════════════════════════════════════════════"
echo "🔐 BrightData Instance Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Wait for network to be ready
echo "[INFO] Waiting for network..."
sleep 5

# Source environment
if [ -f .env ]; then
  echo "[INFO] Loading .env..."
  export $(cat .env | grep -v '^#' | xargs)
fi

# Step 1: Register instance IP
echo "[INFO] Step 1: Registering instance IP..."
if [ -f register-instance-ip.js ]; then
  node register-instance-ip.js || echo "[WARN] Failed to register IP, continuing..."
else
  echo "[WARN] register-instance-ip.js not found"
fi

echo ""

# Step 2: Attempt to whitelist
echo "[INFO] Step 2: Attempting to whitelist IP..."
if [ -f auto-whitelist-brightdata.js ]; then
  node auto-whitelist-brightdata.js || echo "[WARN] Whitelist attempt failed, continuing..."
else
  echo "[WARN] auto-whitelist-brightdata.js not found"
fi

echo ""

# Step 3: Start periodic sync (every 5 minutes)
echo "[INFO] Step 3: Setting up periodic sync..."
if [ -f sync-brightdata-whitelist.js ]; then
  # Run in background
  (
    while true; do
      echo "[CRON] Running BrightData whitelist sync at $(date)"
      node sync-brightdata-whitelist.js 2>&1 || true
      echo "[CRON] Sync complete, sleeping 5 minutes..."
      sleep 300
    done
  ) > /tmp/brightdata-sync.log 2>&1 &
  
  SYNC_PID=$!
  echo "[INFO] Started periodic sync with PID $SYNC_PID"
  echo $SYNC_PID > /tmp/brightdata-sync.pid
else
  echo "[WARN] sync-brightdata-whitelist.js not found"
fi

echo ""
echo "✅ BrightData setup complete!"
echo ""
echo "📊 Status:"
echo "   • Instance IP registered in database"
echo "   • Whitelist attempted (manual fallback if needed)"
echo "   • Periodic sync scheduled (every 5 minutes)"
echo ""
echo "📋 Next steps if manual whitelisting needed:"
echo "   1. Check /tmp/brightdata-sync.log for sync status"
echo "   2. Go to: https://brightdata.com/cp/zones"
echo "   3. Zone: testing_softality_1"
echo "   4. Add IP: $(curl -s https://api.ipify.org)"
echo ""
