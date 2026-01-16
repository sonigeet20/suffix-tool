#!/bin/bash
set -e

# Deploy updated code to all EC2 instances
# Updates: Trackier API URL and redirectType fix

KEY_PATH="$HOME/Downloads/suffix-server.pem"
INSTANCES=(
  "44.223.72.0"
  "34.201.17.254"
  "100.31.240.112"
  "3.237.93.229"
  "3.237.236.115"
  "44.197.183.237"
)

echo "========================================="
echo "Deploying to 6 EC2 instances"
echo "========================================="
echo ""

for IP in "${INSTANCES[@]}"; do
  echo "----------------------------------------"
  echo "📦 Deploying to $IP..."
  echo "----------------------------------------"
  
  # Copy the updated file directly
  echo "📤 Uploading updated trackier-webhook.js..."
  scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
    "./proxy-service/routes/trackier-webhook.js" \
    "ec2-user@$IP:/home/ec2-user/proxy-service/routes/trackier-webhook.js"
  
  if [ $? -ne 0 ]; then
    echo "❌ Failed to upload file to $IP"
    continue
  fi
  
  # Restart PM2 via SSH
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ec2-user@$IP << 'ENDSSH'
    echo "🔍 Verifying file update..."
    grep "https://api.trackier.com/v2" /home/ec2-user/proxy-service/routes/trackier-webhook.js | head -1
    
    echo "🔄 Restarting PM2..."
    pm2 restart all
    
    echo "✅ Deployment complete!"
ENDSSH
  
  if [ $? -eq 0 ]; then
    echo "✅ Successfully deployed to $IP"
  else
    echo "❌ Failed to deploy to $IP"
  fi
  
  echo ""
done

echo "========================================="
echo "✅ Deployment complete on all instances!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Test campaign creation on one instance"
echo "2. Create new AMI from one of the updated instances"
echo "3. Update Launch Template with new AMI"
echo "4. Update Auto Scaling Group to use new Launch Template"
