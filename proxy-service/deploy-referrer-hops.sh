#!/bin/bash

KEY_PATH="$HOME/Downloads/suffix-server.pem"
EC2_USER="ec2-user"
INSTANCES=(
  "44.200.149.184"
  "44.199.229.61"
  "44.212.12.39"
)

echo "🚀 Deploying referrer_hops feature to ${#INSTANCES[@]} instances..."
echo ""

for IP in "${INSTANCES[@]}"; do
  echo "================================================"
  echo "📦 Deploying to $IP"
  echo "================================================"
  
  # Upload updated files
  echo "📤 Uploading server.js..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no ./server.js "$EC2_USER@$IP:~/proxy-service/server.js"
  
  echo "📤 Uploading trace-interactive.js..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no ./trace-interactive.js "$EC2_USER@$IP:~/proxy-service/trace-interactive.js"
  
  # Restart service
  echo "🔄 Restarting proxy service..."
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$IP" << 'ENDSSH'
    cd ~/proxy-service
    pm2 restart proxy-service || pm2 start server.js --name proxy-service
    pm2 save
    echo "✅ Service restarted"
ENDSSH
  
  echo "✅ Deployment complete for $IP"
  echo ""
done

echo "================================================"
echo "🎉 All deployments complete!"
echo "================================================"
