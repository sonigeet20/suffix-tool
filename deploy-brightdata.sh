#!/bin/bash

# Bright Data Browser Tracer - Automated Deployment Script
# Usage: ./deploy-brightdata.sh <server-host> <ssh-key-path> <ec2-user>
# Example: ./deploy-brightdata.sh ec2-52-1-2-3.compute-1.amazonaws.com ~/.ssh/mykey.pem ec2-user

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <server-host> <ssh-key-path> [ec2-user] [project-path]"
    echo ""
    echo "Examples:"
    echo "  $0 ec2-52-1-2-3.compute-1.amazonaws.com ~/.ssh/mykey.pem ec2-user /home/ec2-user/suffix-tool-main\ 2"
    echo "  $0 192.168.1.100 ~/.ssh/id_rsa ubuntu /opt/suffix-tool-main\ 2"
    echo ""
    echo "Defaults:"
    echo "  ec2-user: ec2-user (use 'ubuntu' for Ubuntu instances)"
    echo "  project-path: /home/ec2-user/suffix-tool-main\ 2"
    exit 1
fi

SERVER_HOST="$1"
SSH_KEY="$2"
EC2_USER="${3:-ec2-user}"
PROJECT_PATH="${4:-/home/ec2-user/suffix-tool-main 2}"
PROXY_SERVICE_PATH="$PROJECT_PATH/proxy-service"

echo "=================================================="
echo "Bright Data Browser Tracer - Deployment Script"
echo "=================================================="
echo ""
echo "Server: $SERVER_HOST"
echo "User: $EC2_USER"
echo "Project Path: $PROJECT_PATH"
echo "Proxy Service: $PROXY_SERVICE_PATH"
echo ""

# Step 1: Pull latest changes
echo "📥 Pulling latest changes from repository..."
ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "cd \"$PROJECT_PATH\" && git pull origin main" || {
    echo "❌ Failed to pull changes. Check server path and git setup."
    exit 1
}

# Step 2: Verify server.js has the new functions
echo ""
echo "🔍 Verifying server.js contains Bright Data Browser functions..."
ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "grep -q 'traceRedirectsBrightDataBrowser' \"$PROXY_SERVICE_PATH/server.js\"" && {
    echo "✅ traceRedirectsBrightDataBrowser function found"
} || {
    echo "⚠️  Warning: traceRedirectsBrightDataBrowser not found in server.js"
}

ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "grep -q 'loadBrightDataApiKey' \"$PROXY_SERVICE_PATH/server.js\"" && {
    echo "✅ loadBrightDataApiKey function found"
} || {
    echo "⚠️  Warning: loadBrightDataApiKey not found in server.js"
}

# Step 3: Restart the proxy service
echo ""
echo "🔄 Restarting proxy service..."

# Check if PM2 is used
ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "which pm2 > /dev/null 2>&1" && {
    echo "  Using PM2 to restart..."
    ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "cd \"$PROXY_SERVICE_PATH\" && pm2 restart proxy-service" && {
        echo "✅ Service restarted with PM2"
    } || {
        echo "⚠️  PM2 restart failed, trying direct start..."
        ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "pkill -f 'node server.js' || true"
        sleep 2
        ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "cd \"$PROXY_SERVICE_PATH\" && nohup node server.js > /tmp/proxy-service.log 2>&1 &"
        echo "✅ Service started with direct node command"
    }
} || {
    echo "  PM2 not found, using direct node..."
    ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "pkill -f 'node server.js' || true"
    sleep 2
    ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "cd \"$PROXY_SERVICE_PATH\" && nohup node server.js > /tmp/proxy-service.log 2>&1 &"
    echo "✅ Service started"
}

# Step 4: Wait for service to start
echo ""
echo "⏳ Waiting for service to start (5 seconds)..."
sleep 5

# Step 5: Test the service
echo ""
echo "🧪 Testing service health..."

TEST_RESULT=$(ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "curl -s http://localhost:3000/trace -X OPTIONS -w '%{http_code}' -o /dev/null" || echo "0")

if [ "$TEST_RESULT" = "200" ] || [ "$TEST_RESULT" = "404" ]; then
    echo "✅ Service is running and responding to requests"
else
    echo "⚠️  Service may not be responding. Status code: $TEST_RESULT"
    echo "  Check server logs: /tmp/proxy-service.log"
fi

# Step 6: Show logs
echo ""
echo "📋 Recent service logs:"
ssh -i "$SSH_KEY" "$EC2_USER@$SERVER_HOST" "tail -20 /tmp/proxy-service.log || tail -20 /var/log/syslog | grep node || echo '(No logs available yet)'"

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Test from frontend: Select 'Bright Data Browser' in Scripts section"
echo "2. Monitor logs on server:"
echo "   ssh -i \"$SSH_KEY\" \"$EC2_USER@$SERVER_HOST\" \"tail -f /tmp/proxy-service.log\""
echo "3. Check Supabase settings to ensure Bright Data API key is configured"
echo ""
