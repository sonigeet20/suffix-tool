#!/bin/bash
# Quick Start Proxy Service for Testing

echo "Starting proxy-service for local testing..."
echo ""

cd /Users/geetsoni/Downloads/suffix-tool-main\ 2/proxy-service

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

echo "🚀 Starting proxy-service on port 3000..."
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the service
PORT=3000 node server.js
