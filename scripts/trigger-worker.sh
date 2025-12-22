#!/bin/bash
# Script to trigger the background trace worker
# Can be run manually or scheduled via cron

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

# Default values
BATCH_SIZE=${1:-10}
MAX_CONCURRENT=${2:-5}

echo "🚀 Triggering background worker..."
echo "   Batch size: $BATCH_SIZE"
echo "   Max concurrent: $MAX_CONCURRENT"

# Call the trace-worker edge function
RESPONSE=$(curl -s -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/trace-worker" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -d "{\"batch_size\": ${BATCH_SIZE}, \"max_concurrent\": ${MAX_CONCURRENT}}")

echo ""
echo "📊 Worker Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  PROCESSED=$(echo "$RESPONSE" | jq -r '.processed // 0')
  SUCCEEDED=$(echo "$RESPONSE" | jq -r '.succeeded // 0')
  FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0')

  echo ""
  echo "✅ Worker completed successfully"
  echo "   Processed: $PROCESSED"
  echo "   Succeeded: $SUCCEEDED"
  echo "   Failed: $FAILED"

  exit 0
else
  echo ""
  echo "❌ Worker failed"
  exit 1
fi
