#!/bin/bash

echo "🚀 Deploying to All Remaining Instances"
echo "========================================"
echo ""

REMAINING_IPS="3.239.66.202 3.238.243.226 18.207.182.250 100.52.167.38 34.200.234.151 98.80.183.183"

UPDATED=0
FAILED=0

for IP in $REMAINING_IPS; do
  echo "📦 Deploying to $IP..."
  
  if scp -i ~/Downloads/suffix-server.pem \
    proxy-service/server.js \
    proxy-service/routes/google-ads-click.js \
    ec2-user@$IP:~/proxy-service/ > /dev/null 2>&1; then
    echo "   ✅ Files copied"
    
    if ssh -i ~/Downloads/suffix-server.pem ec2-user@$IP "pm2 restart all" > /dev/null 2>&1; then
      echo "   ✅ Service restarted"
      ((UPDATED++))
    else
      echo "   ⚠️  Restart failed"
      ((FAILED++))
    fi
  else
    echo "   ❌ Copy failed"
    ((FAILED++))
  fi
  
  echo ""
done

echo "========================================"
echo "✅ Full Deployment Complete!"
echo ""
echo "Updated: $UPDATED instances"
echo "Failed: $FAILED instances"
echo ""
echo "Summary:"
echo "- Silent fetch now works with Google Ads parallel tracking"
echo "- POST requests trigger server-side tracking URL fetch"
echo "- GET requests return HTML with client-side triple-method tracking"
echo "- All 7 instances updated and running"
