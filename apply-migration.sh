#!/bin/bash

echo "Applying migration to add trace_date column..."

curl -X POST "https://rfhuqenntxiqurplenjn.supabase.co/rest/v1/rpc/exec" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "query": "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_trace_counts' AND column_name='trace_date') THEN ALTER TABLE daily_trace_counts ADD COLUMN trace_date DATE DEFAULT CURRENT_DATE; END IF; END $$; CREATE INDEX IF NOT EXISTS idx_daily_trace_counts_date ON daily_trace_counts(offer_name, account_id, trace_date); UPDATE daily_trace_counts SET trace_date = CURRENT_DATE WHERE trace_date IS NULL;"
}
EOF

echo ""
echo "Migration complete! Please open Supabase Dashboard and run this SQL manually:"
echo ""
echo "ALTER TABLE daily_trace_counts ADD COLUMN IF NOT EXISTS trace_date DATE DEFAULT CURRENT_DATE;"
echo "CREATE INDEX IF NOT EXISTS idx_daily_trace_counts_date ON daily_trace_counts(offer_name, account_id, trace_date);"
echo "UPDATE daily_trace_counts SET trace_date = CURRENT_DATE WHERE trace_date IS NULL;"
echo ""
echo "Dashboard URL: https://supabase.com/dashboard/project/rfhuqenntxiqurplenjn/sql/new"
