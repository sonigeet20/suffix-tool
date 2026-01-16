#!/bin/bash

# Run webhook suffix system migration
# This creates the 4 new tables: webhook_campaign_mappings, webhook_suffix_bucket, webhook_suffix_update_queue, webhook_suffix_usage_log

SUPABASE_URL="https://rfhuqenntxiqurplenjn.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE"

echo "🚀 Running webhook suffix system migration..."
echo ""

# Read the SQL file
SQL_CONTENT=$(cat supabase/migrations/webhook_suffix_system.sql)

# Execute via Supabase SQL endpoint
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"sql\": $(jq -Rs . <<< "$SQL_CONTENT")}"

echo ""
echo "✅ Migration complete!"
echo ""
echo "Verifying tables..."
curl -s "${SUPABASE_URL}/rest/v1/webhook_campaign_mappings?limit=0" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" | jq -r 'if type == "array" then "✅ webhook_campaign_mappings" else "❌ webhook_campaign_mappings - " + .message end'

curl -s "${SUPABASE_URL}/rest/v1/webhook_suffix_bucket?limit=0" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" | jq -r 'if type == "array" then "✅ webhook_suffix_bucket" else "❌ webhook_suffix_bucket - " + .message end'

curl -s "${SUPABASE_URL}/rest/v1/webhook_suffix_update_queue?limit=0" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" | jq -r 'if type == "array" then "✅ webhook_suffix_update_queue" else "❌ webhook_suffix_update_queue - " + .message end'

curl -s "${SUPABASE_URL}/rest/v1/webhook_suffix_usage_log?limit=0" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" | jq -r 'if type == "array" then "✅ webhook_suffix_usage_log" else "❌ webhook_suffix_usage_log - " + .message end'
