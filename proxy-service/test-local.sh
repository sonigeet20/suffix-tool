#!/bin/bash

# Quick test script for local proxy service

echo "🧪 Testing Luna Proxy Service locally..."
echo ""

BASE_URL="http://localhost:3000"

# Check if server is running
echo "1️⃣  Testing /health endpoint..."
curl -s "$BASE_URL/health" | jq '.' || echo "❌ Service not running. Start with: npm start"
echo ""

# Check proxy IP
echo "2️⃣  Testing /ip endpoint (checking proxy IP)..."
curl -s "$BASE_URL/ip" | jq '.'
echo ""

# Test redirect tracing
echo "3️⃣  Testing /trace endpoint with bit.ly URL..."
curl -s -X POST "$BASE_URL/trace" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/redirect/3",
    "max_redirects": 20,
    "timeout_ms": 30000
  }' | jq '.'
echo ""

echo "✅ Tests complete!"
echo ""
echo "📝 Next steps:"
echo "   - Check that proxy_ip is different from your AWS/local IP"
echo "   - Verify chain has all redirect steps"
echo "   - If working, deploy to AWS using AWS-DEPLOYMENT-GUIDE.md"
