#!/bin/bash

# BrightData IP Auto-Whitelist Setup Script
# Runs on EC2 instance startup to automatically whitelist the instance IP

set -e

echo "═══════════════════════════════════════════════"
echo "🚀 BrightData Auto-Whitelist Setup"
echo "═══════════════════════════════════════════════"
echo ""

# Wait for network to be ready
echo "⏳ Waiting for network to be ready..."
sleep 5

# Change to proxy-service directory
cd /home/ubuntu/proxy-service || cd /home/ec2-user/proxy-service || {
  echo "❌ Could not find proxy-service directory"
  exit 1
}

echo "✅ Found proxy-service directory"

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
  echo "✅ Loaded environment variables from .env"
else
  echo "⚠️  No .env file found, using system environment variables"
fi

# Run the auto-whitelist script
echo ""
echo "🔐 Running BrightData IP whitelist script..."
node auto-whitelist-brightdata.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ BrightData IP auto-whitelist completed successfully"
  echo ""
  
  # Log to syslog
  logger -t brightdata-whitelist "Successfully whitelisted instance IP in BrightData"
else
  echo ""
  echo "❌ BrightData IP auto-whitelist failed with exit code $EXIT_CODE"
  echo "   The proxy service will still start, but BrightData may not work."
  echo ""
  
  # Log to syslog
  logger -t brightdata-whitelist "Failed to whitelist instance IP in BrightData (exit code: $EXIT_CODE)"
fi

exit 0
