#!/bin/bash
set -e

# Deploy CSP fix to all EC2 instances

KEY_PATH="$HOME/Downloads/suffix-server.pem"
INSTANCES=(
  "3.228.7.25"
  "98.92.62.241"
  "54.157.97.246"
  "3.235.45.254"
  "18.208.202.251"
  "18.207.182.250"
  "44.199.255.148"
  "98.80.183.183"
)

echo "========================================="
echo "Deploying CSP fix to all 7 EC2 instances"
echo "========================================="
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0

for IP in "${INSTANCES[@]}"; do
  echo "----------------------------------------"
  echo "📦 Deploying to $IP..."
  echo "----------------------------------------"
  
  # Upload google-ads-click.js
  echo "📤 Uploading google-ads-click.js..."
  if scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    "./proxy-service/routes/google-ads-click.js" \
    "ec2-user@$IP:/home/ec2-user/proxy-service/routes/google-ads-click.js"; then
    
    # Upload server.js
    echo "📤 Uploading server.js..."
    if scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
      "./proxy-service/server.js" \
      "ec2-user@$IP:/home/ec2-user/proxy-service/server.js"; then
      
      # Restart PM2
      echo "🔄 Restarting PM2..."
      if ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        ec2-user@$IP "pm2 restart all"; then
        
        echo "✅ Successfully deployed to $IP"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      else
        echo "❌ Failed to restart PM2 on $IP"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      fi
    else
      echo "❌ Failed to upload server.js to $IP"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    echo "❌ Failed to upload google-ads-click.js to $IP"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  
  echo ""
  sleep 1
done

echo "========================================="
echo "📊 Deployment Summary"
echo "========================================="
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAIL_COUNT"
echo ""

if [ $SUCCESS_COUNT -eq 7 ]; then
  echo "🎉 All instances deployed successfully!"
  exit 0
elif [ $SUCCESS_COUNT -gt 0 ]; then
  echo "⚠️  Partial deployment completed"
  exit 1
else
  echo "❌ Deployment failed on all instances"
  exit 1
fi
