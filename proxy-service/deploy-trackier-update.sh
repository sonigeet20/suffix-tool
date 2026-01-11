#!/bin/bash
set -e

echo "🚀 Deploying Trackier Edge Function Integration to AWS"
echo "======================================================="
echo ""

# EC2 instances
INSTANCES=(
  "44.200.149.184"
  "3.223.135.219"
  "18.209.87.254"
)

KEY_FILE="~/Downloads/suffix-server.pem"

echo "📦 Deploying trackier-webhook.js to all instances..."
echo ""

for INSTANCE_IP in "${INSTANCES[@]}"; do
  echo "  → Deploying to $INSTANCE_IP..."
  
  # Try to deploy
  if scp -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
     routes/trackier-webhook.js ec2-user@$INSTANCE_IP:~/proxy-service/routes/ 2>/dev/null; then
    
    # Restart PM2
    if ssh -i $KEY_FILE -o ConnectTimeout=5 ec2-user@$INSTANCE_IP \
       'cd proxy-service && pm2 restart proxy-server' 2>/dev/null; then
      echo "    ✅ Deployed and restarted"
    else
      echo "    ⚠️  Deployed but restart failed"
    fi
  else
    echo "    ❌ Failed to connect (instance may be terminated)"
  fi
  echo ""
done

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Apply migration to Supabase (copy 20260110025000_fix_trackier_columns.sql)"
echo "2. Update Trackier config update_interval_seconds to 1"
echo "3. Configure S2S Push URL in Trackier dashboard manually"
