#!/bin/bash
# Deploy updated google-ads-click.js with bot detection and repeat IP blocking

set -e

INSTANCES=(
  "ec2-user@13.222.100.70"
  "ec2-user@13.220.246.128"
  "ec2-user@52.54.72.188"
  "ec2-user@44.200.222.95"
  "ec2-user@100.53.41.66"
  "ec2-user@44.195.20.244"
)

PEM_KEY="$HOME/Downloads/suffix-server.pem"

echo "========================================="
echo "Deploying Google Ads Click Handler"
echo "========================================="
echo ""
echo "Features in this update:"
echo "  ✓ isbot library (900+ bot patterns)"
echo "  ✓ MaxMind GeoIP2 datacenter detection"
echo "  ✓ Repeat IP blocking (7-day default window)"
echo "  ✓ Configurable repeat IP window from frontend"
echo ""

for instance in "${INSTANCES[@]}"; do
  echo "========================================="
  echo "Deploying to: $instance"
  echo "========================================="
  
  # Copy updated handler
  echo "Copying google-ads-click.js..."
  scp -i "$PEM_KEY" proxy-service/routes/google-ads-click.js "$instance:/home/ec2-user/proxy-service/routes/" || {
    echo "ERROR: Failed to copy handler to $instance"
    continue
  }
  
  # Restart PM2
  echo "Restarting PM2..."
  ssh -i "$PEM_KEY" "$instance" "pm2 restart all" || {
    echo "ERROR: Failed to restart PM2 on $instance"
    continue
  }
  
  # Wait for service to start
  sleep 3
  
  # Health check
  echo "Testing /click/health..."
  HEALTH_URL="http://$instance:3000/click/health"
  HEALTH_RESPONSE=$(ssh -i "$PEM_KEY" "$instance" "curl -s $HEALTH_URL" || echo "FAILED")
  
  if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
    echo "✓ Health check passed on $instance"
  else
    echo "✗ Health check failed on $instance"
    echo "Response: $HEALTH_RESPONSE"
  fi
  
  echo ""
done

echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "Testing bot detection..."
echo "Attempting click with bot User-Agent..."
echo ""

# Test with bot user agent (should be blocked)
TEST_INSTANCE="13.222.100.70"
TEST_URL="http://$TEST_INSTANCE:3000/click?offer_name=test&url=https://example.com"
echo "Test URL: $TEST_URL"
echo "User-Agent: Googlebot/2.1"
echo ""

RESPONSE=$(curl -s -H "User-Agent: Googlebot/2.1" "$TEST_URL" || echo "FAILED")
if [[ "$RESPONSE" == *"blocked"* ]] || [[ "$RESPONSE" == *"Bot detected"* ]]; then
  echo "✓ Bot detection working - request was blocked"
else
  echo "✗ Bot detection may not be working"
  echo "Response: $RESPONSE"
fi

echo ""
echo "========================================="
echo "Next Steps"
echo "========================================="
echo ""
echo "1. Update frontend to show repeat IP window control"
echo "2. Test repeat IP blocking:"
echo "   - Make a normal click"
echo "   - Wait a few seconds"
echo "   - Make another click from same IP"
echo "   - Second click should be blocked with 'Repeat IP' reason"
echo ""
echo "3. Configure filtering in offer settings:"
echo "   {"
echo "     \"filtering\": {"
echo "       \"enabled\": true,"
echo "       \"bot_detection\": true,"
echo "       \"block_datacenters\": true,"
echo "       \"repeat_ip_window_days\": 7"
echo "     }"
echo "   }"
echo ""
