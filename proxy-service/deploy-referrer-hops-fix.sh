#!/bin/bash

# Deploy referrer_hops fix to single instance for stability testing
# This includes all critical fixes:
# 1. Remove referrer from setExtraHTTPHeaders (was applying to all hops)
# 2. Remove referer option from page.goto() 
# 3. Add explicit header removal when shouldApply=false
# 4. Ensure setInterval leak fix is present
# 5. Ensure trackier-webhook.js exists

set -e

INSTANCE_IP="44.200.149.184"
SSH_KEY="~/Downloads/suffix-server.pem"
LOCAL_DIR="/Users/geetsoni/Downloads/suffix-tool-main 2/proxy-service"

echo "🚀 Deploying referrer_hops fixes to $INSTANCE_IP"
echo ""

# 1. Upload server.js with all fixes
echo "📤 Uploading server.js..."
scp -i "$SSH_KEY" "$LOCAL_DIR/server.js" ec2-user@$INSTANCE_IP:~/proxy-service/server.js

# 2. Verify trackier-webhook.js exists (don't overwrite if already there)
echo "✅ Verifying trackier-webhook.js exists..."
ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "ls -la ~/proxy-service/routes/trackier-webhook.js"

# 3. Verify .env file exists
echo "✅ Verifying .env exists..."
ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "ls -la ~/proxy-service/.env"

# 4. Restart PM2 with environment variables
echo "🔄 Restarting PM2 process..."
ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "cd ~/proxy-service && pm2 restart proxy-service --update-env"

# 5. Wait a moment for restart
echo "⏳ Waiting for service to start..."
sleep 5

# 6. Check PM2 status
echo "📊 Checking PM2 status..."
ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "pm2 list"

# 7. Check recent logs
echo ""
echo "📋 Recent logs:"
ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "pm2 logs proxy-service --lines 20 --nostream"

# 8. Monitor for 30 seconds
echo ""
echo "👀 Monitoring for 30 seconds..."
for i in {1..6}; do
    sleep 5
    RESTARTS=$(ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "pm2 jlist | jq '.[0].pm2_env.restart_time'" 2>/dev/null || echo "0")
    CPU=$(ssh -i "$SSH_KEY" ec2-user@$INSTANCE_IP "top -bn1 | grep 'Cpu(s)' | awk '{print 100-\$8}'" 2>/dev/null || echo "0")
    echo "  [$((i*5))s] Restarts: $RESTARTS | CPU: ${CPU}%"
done

echo ""
echo "✅ Deployment complete!"
echo "🔍 Continue monitoring: ssh -i $SSH_KEY ec2-user@$INSTANCE_IP \"pm2 monit\""
