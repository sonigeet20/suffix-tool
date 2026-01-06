#!/bin/bash
set -e

export AWS_PROFILE=url-tracker-prod
cd "$(dirname "$0")"

echo "📦 Deploying optimized server.js to all instances..."

# Instance 1
echo "  Deploying to i-03ea38b1268e76630 (18.204.4.188)..."
scp -i ~/Downloads/suffix-server.pem -o StrictHostKeyChecking=no server.js ec2-user@18.204.4.188:~/proxy-service/
ssh -i ~/Downloads/suffix-server.pem ec2-user@18.204.4.188 'cd proxy-service && pm2 restart proxy-server'
echo "  ✅ Updated"

# Instance 2
echo "  Deploying to i-024d1125dae88ceb4 (3.231.93.225)..."
scp -i ~/Downloads/suffix-server.pem -o StrictHostKeyChecking=no server.js ec2-user@3.231.93.225:~/proxy-service/
ssh -i ~/Downloads/suffix-server.pem ec2-user@3.231.93.225 'cd proxy-service && pm2 restart proxy-server'
echo "  ✅ Updated"

# Instance 3
echo "  Deploying to i-055f78c26e6ed2d4a (98.92.34.34)..."
scp -i ~/Downloads/suffix-server.pem -o StrictHostKeyChecking=no server.js ec2-user@98.92.34.34:~/proxy-service/
ssh -i ~/Downloads/suffix-server.pem ec2-user@98.92.34.34 'cd proxy-service && pm2 restart proxy-server'
echo "  ✅ Updated"

echo ""
echo "🎉 All 3 instances updated with bandwidth optimization!"
echo ""
echo "Usage: Pass 'debug=true' in API request to enable bandwidth calculation:"
echo "curl -X POST http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/trace \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"url\": \"https://example.com\", \"mode\": \"http_only\", \"debug\": true}'"
