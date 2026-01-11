# Trackier Integration Testing Guide

## Step 1: Apply Database Migration

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/rfhuqenntxiqurplenjn/sql/new

2. Copy and paste the entire contents of:
   `supabase/migrations/20260110020000_trackier_integration_complete.sql`

3. Click "Run" to execute the migration

## Step 2: Start Local Frontend

```bash
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"
npm run dev
```

## Step 3: Test Trackier Setup

1. Open http://localhost:5173 in your browser
2. Login to your account
3. Go to Offers list
4. Click the Webhook icon (⚡) on any offer
5. Fill in the Trackier configuration:
   - API Key
   - Advertiser ID
   - Campaign IDs (URL 1 and URL 2)
   - **NEW**: Configure p1-p10 parameter mapping
6. Save configuration
7. Test webhook trigger

## Step 4: Verify Backend Integration

Test the webhook endpoint:
```bash
curl -X POST http://localhost:3000/api/trackier-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "your_campaign_id",
    "click_id": "test_click_123",
    "publisher_id": "2",
    "ip": "1.2.3.4"
  }'
```

## Expected Results

✅ **Database**:
- trackier_offers table created with sub_id_mapping, sub_id_values, macro_mapping columns
- trackier_webhook_logs table created
- trackier_trace_history table created
- trackier_api_calls table created

✅ **Frontend**:
- TrackierSetup component shows p1-p10 mapping UI
- Can configure parameter mappings (e.g., p1 → gclid, p2 → fbclid)
- Saves configuration to database

✅ **Backend**:
- Webhook endpoint receives clicks
- Maps parameters based on sub_id_mapping
- Updates URL 2 campaign with traced suffix
- Logs activity to database

## Troubleshooting

### Migration Fails
- Check if tables already exist
- Drop existing trackier tables if needed:
  ```sql
  DROP TABLE IF EXISTS trackier_api_calls CASCADE;
  DROP TABLE IF EXISTS trackier_trace_history CASCADE;
  DROP TABLE IF EXISTS trackier_webhook_logs CASCADE;
  DROP TABLE IF EXISTS trackier_offers CASCADE;
  ```

### Frontend Errors
- Clear browser cache
- Check console for errors
- Verify Supabase connection

### Backend Errors
- Check proxy-service/server.js is running
- Verify SUPABASE_SERVICE_ROLE_KEY is set
- Check logs for errors
