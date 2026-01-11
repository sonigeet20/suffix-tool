#!/bin/bash

# Fix for high CPU usage - clear interval before creating new one

INSTANCES=(
  "44.200.149.184"
  "44.199.229.61"
  "44.212.12.39"
)

echo "🔧 Deploying CPU fix to AWS instances..."
echo ""

for INSTANCE in "${INSTANCES[@]}"; do
  echo "📡 Deploying to $INSTANCE..."
  
  # Upload fixed server.js
  scp -i ~/Downloads/suffix-server.pem -o StrictHostKeyChecking=no server.js ubuntu@$INSTANCE:~/proxy-service/
  
  # Restart PM2
  ssh -i ~/Downloads/suffix-server.pem -o StrictHostKeyChecking=no ubuntu@$INSTANCE "cd ~/proxy-service && pm2 restart proxy-service"
  
  echo "✅ Deployed to $INSTANCE"
  echo ""
done

echo "🎉 All instances updated!"
