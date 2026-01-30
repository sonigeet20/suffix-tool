#!/bin/bash
#
# Deploy Google Ads Parallel Tracking Fix to AWS Infrastructure
# This script updates the running instances with POST request support for sendBeacon
#

set -e

echo "🚀 Deploying Google Ads Parallel Tracking Fix"
echo "=============================================="
echo ""

# Get all running instances from ASG
INSTANCE_IPS=$(aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=url-tracker-proxy-asg" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].PublicIpAddress' \
  --output text)

if [ -z "$INSTANCE_IPS" ]; then
  echo "❌ No running instances found in ASG"
  exit 1
fi

echo "📋 Found instances to update:"
for IP in $INSTANCE_IPS; do
  echo "   - $IP"
done
echo ""

UPDATED=0
FAILED=0

for IP in $INSTANCE_IPS; do
  echo "📦 Deploying to $IP..."
  
  # Copy updated files
  if scp -i ~/.ssh/suffix-server.pem \
    proxy-service/server.js \
    proxy-service/routes/google-ads-click.js \
    ubuntu@$IP:~/proxy-service/; then
    
    echo "   ✅ Files copied successfully"
    
    # Restart PM2 service
    if ssh -i ~/.ssh/suffix-server.pem ubuntu@$IP \
      'cd ~/proxy-service && pm2 restart server'; then
      
      echo "   ✅ Service restarted"
      ((UPDATED++))
    else
      echo "   ⚠️  Failed to restart service"
      ((FAILED++))
    fi
  else
    echo "   ❌ Failed to copy files"
    ((FAILED++))
  fi
  
  echo ""
done

echo "=============================================="
echo "✅ Deployment Complete!"
echo ""
echo "Summary:"
echo "  - Updated: $UPDATED instances"
echo "  - Failed: $FAILED instances"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 All instances updated successfully!"
  echo ""
  echo "Next steps:"
  echo "1. Test with a real Google Ads click"
  echo "2. Check server logs: ssh -i ~/.ssh/suffix-server.pem ubuntu@<IP> 'pm2 logs server'"
  echo "3. Verify POST requests are being logged"
  echo ""
  echo "Expected log entries:"
  echo "  [google-ads-click] POST request received for offer: <offer_name>"
  echo "  [google-ads-click] POST request - returning 204 No Content"
else
  echo "⚠️  Some instances failed to update. Please check manually."
fi
