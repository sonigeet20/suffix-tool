#!/bin/bash

# Deploy GCLID tracking to test instance
# Usage: ./deploy-gclid-test.sh

set -e

TEST_IP="3.228.7.25"
SSH_KEY="~/Downloads/suffix-server.pem"

echo "🚀 Deploying GCLID tracking to test instance: $TEST_IP"

# Deploy updated google-ads-click.js
echo "📦 Copying google-ads-click.js..."
scp -i "$SSH_KEY" proxy-service/routes/google-ads-click.js ec2-user@$TEST_IP:~/proxy-service/routes/

# Restart service
echo "🔄 Restarting proxy service..."
ssh -i "$SSH_KEY" ec2-user@$TEST_IP "pm2 restart proxy-service"

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run test-gclid-setup.sql to configure the database"
echo "2. Test with: curl 'http://$TEST_IP:3000/click?offer_name=NAZWA_PL_SHEET_314_SKIM&redirect_url=https://example.com&clickref=TEST_GCLID_123'"
echo "3. Check logs: ssh -i $SSH_KEY ec2-user@$TEST_IP 'pm2 logs proxy-service --lines 50 | grep GCLID'"
