#!/bin/bash
# Script to check IP pool health and system status
# Can be run manually or scheduled via monitoring systems

set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set"
  exit 1
fi

echo "🔍 Checking IP pool health..."
echo ""

# Call the pool-monitor edge function
RESPONSE=$(curl -s -X GET \
  "${VITE_SUPABASE_URL}/functions/v1/pool-monitor" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}")

# Pretty print the response
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Check for warnings
WARNINGS=$(echo "$RESPONSE" | jq -r '.warnings // [] | length' 2>/dev/null || echo "0")

if [ "$WARNINGS" -gt 0 ]; then
  echo ""
  echo "⚠️  $WARNINGS warning(s) detected!"
  echo "$RESPONSE" | jq -r '.warnings[]' 2>/dev/null
  echo ""
  echo "Recommendation: $(echo "$RESPONSE" | jq -r '.recommendation')"
  exit 1
else
  echo ""
  echo "✅ System operating normally"
  exit 0
fi
