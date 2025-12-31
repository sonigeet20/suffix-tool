#!/bin/bash

set -e

echo "=========================================="
echo "Deploying Parallel Geolocation Optimization"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
  echo "❌ Error: server.js not found in current directory"
  echo "Please run this script from the proxy-service directory"
  exit 1
fi

echo "Step 1: Creating backup..."
BACKUP_FILE="server.js.backup-$(date +%Y%m%d-%H%M%S)"
cp server.js "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"
echo ""

echo "Step 2: Checking current version..."
if grep -q "Promise.all(\[tracePromise, geoPromise\])" server.js; then
  echo "✅ Already optimized! No changes needed."
  exit 0
fi
echo "⏳ Current version needs optimization"
echo ""

echo "Step 3: Applying optimizations..."

# Optimization 1: Reduce geolocation timeout
echo "  - Reducing geolocation timeout (10s → 3s)..."
sed -i.tmp1 's/timeout: 10000,/timeout: 3000,/g' server.js

# Optimization 2: Change error to warn for geolocation
echo "  - Making geolocation non-critical..."
sed -i.tmp2 "s/logger\.error('Geolocation fetch error:/logger.warn('Geolocation fetch error (non-critical):/g" server.js

# Optimization 3: Update log messages
echo "  - Improving log messages..."
sed -i.tmp3 "s/logger\.info('Trace request:/logger.info('⚡ Trace request:/g" server.js
sed -i.tmp4 "s/Using geo-targeted username for all connections/Geo-targeting/g" server.js

# Note: The Promise.all optimization requires more complex changes
# that can't be done with sed, so we'll provide instructions

rm -f server.js.tmp*

echo "✅ Basic optimizations applied!"
echo ""

echo "=========================================="
echo "Manual Step Required"
echo "=========================================="
echo ""
echo "The parallel geolocation fetch requires a code restructure."
echo "Please edit server.js and make this change:"
echo ""
echo "Around line 530-543, change:"
echo ""
cat << 'EOF'
    // OLD (Sequential):
    const result = await traceRedirects(url, {
      maxRedirects: max_redirects || 20,
      timeout: timeout_ms || 60000,
      userAgent: user_agent || userAgentRotator.getNext(),
      targetCountry: target_country || null,
      referrer: referrer || null,
    });

    logger.info('Fetching geolocation data with same proxy credentials...');
    const geoData = await fetchGeolocation(geoUsername, proxySettings.password);
    logger.info('Geolocation data retrieved:', { ip: geoData.ip, country: geoData.country });

    const totalTime = Date.now() - startTime;
    logger.info('Trace completed:', { url, totalTime, steps: result.total_steps });
EOF
echo ""
echo "To:"
echo ""
cat << 'EOF'
    // NEW (Parallel):
    const geoPromise = fetchGeolocation(geoUsername, proxySettings.password);

    const tracePromise = traceRedirects(url, {
      maxRedirects: max_redirects || 20,
      timeout: timeout_ms || 60000,
      userAgent: user_agent || userAgentRotator.getNext(),
      targetCountry: target_country || null,
      referrer: referrer || null,
    });

    const [result, geoData] = await Promise.all([tracePromise, geoPromise]);

    const totalTime = Date.now() - startTime;
    logger.info(`✅ Trace completed: ${result.total_steps} steps in ${totalTime}ms`);
EOF
echo ""

echo "=========================================="
echo "After Manual Edit"
echo "=========================================="
echo ""
echo "1. Save the file"
echo "2. Restart the service:"
echo "   pm2 restart proxy-service"
echo ""
echo "3. Check logs:"
echo "   pm2 logs proxy-service --lines 20"
echo ""
echo "4. Test a trace:"
echo "   curl -X POST http://localhost:3000/trace \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"url\":\"https://bit.ly/test\"}'"
echo ""
echo "Expected: ~8-10 seconds (down from 11-34 seconds)"
echo ""

echo "=========================================="
echo "Rollback if Needed"
echo "=========================================="
echo ""
echo "If issues occur, rollback with:"
echo "  cp $BACKUP_FILE server.js"
echo "  pm2 restart proxy-service"
echo ""
