#!/bin/bash

# Deploy URL Parameter Redirect Fix to EC2
# This fixes the issue where pages with URL parameter redirects (like mobupps)
# were stopping at intermediate pages instead of following through to final destination

EC2_IP="your-ec2-ip-here"
EC2_USER="ec2-user"
EC2_KEY="~/.ssh/your-key.pem"

echo "🚀 Deploying URL parameter redirect fix to EC2..."
echo ""

# 1. Copy updated server.js to EC2
echo "📤 Uploading server.js..."
scp -i "$EC2_KEY" ./server.js "$EC2_USER@$EC2_IP:~/proxy-service/server.js"

if [ $? -ne 0 ]; then
  echo "❌ Failed to upload server.js"
  exit 1
fi

echo "✅ Upload complete"
echo ""

# 2. Restart the proxy service on EC2
echo "🔄 Restarting proxy service on EC2..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_IP" << 'EOF'
  cd ~/proxy-service
  
  # Stop existing process
  pm2 stop proxy-service 2>/dev/null || pkill -f "node.*server.js"
  sleep 2
  
  # Start with PM2
  pm2 start server.js --name proxy-service
  pm2 save
  
  echo "✅ Service restarted"
  
  # Check health
  sleep 3
  curl -s http://localhost:3000/health | jq '.status' || echo "⚠️ Health check failed"
EOF

if [ $? -ne 0 ]; then
  echo "❌ Failed to restart service"
  exit 1
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📝 What was fixed:"
echo "  • Browser now detects 'url' parameters in responses"
echo "  • Automatically follows URL parameter redirects"
echo "  • Prevents early stop at intermediate redirect pages"
echo "  • Works universally with any tracking provider using URL params"
echo ""
echo "🧪 Test with:"
echo "  curl 'https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/get-suffix?offer_name=ELCORTE_ES_SHEET_MOB_NEW' \\"
echo "    -H 'Authorization: Bearer YOUR_TOKEN'"
