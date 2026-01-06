#!/bin/bash
set -e

INSTANCES=("18.204.4.188" "44.203.80.146" "13.218.100.97")
KEY_PATH="$HOME/.ssh/url-tracker-key-new.pem"

echo "🚀 Deploying geo rotation fix to ${#INSTANCES[@]} instances..."

for IP in "${INSTANCES[@]}"; do
  echo ""
  echo "📦 Deploying to $IP..."
  
  # Copy updated server.js
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no server.js ec2-user@$IP:/home/ec2-user/proxy-service/
  
  # Restart PM2
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ec2-user@$IP << 'REMOTE'
    cd /home/ec2-user/proxy-service
    pm2 restart server || pm2 start server.js --name server
    echo "✅ PM2 restarted"
REMOTE
  
  echo "✅ Deployed to $IP"
done

echo ""
echo "🎉 Deployment complete! Testing..."
sleep 3

# Test geo rotation
echo ""
echo "Testing geo rotation with 3 requests (should cycle US → GB → IN):"
for i in {1..3}; do
  echo -n "Request $i: "
  curl -s http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/trace \
    -X POST -H "Content-Type: application/json" \
    -d '{"url":"https://www.amazon.com","mode":"http_only","geo_pool":["US","GB","IN"],"geo_strategy":"round_robin","timeout_ms":10000}' \
    | jq -r '.selected_geo'
done
