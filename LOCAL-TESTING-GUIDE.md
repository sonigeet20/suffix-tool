# Local Testing Guide 🧪

## Quick Start - 3 Steps

### Step 1: Apply Trackier Migration ⚡

1. **Open Supabase SQL Editor**:
   https://supabase.com/dashboard/project/rfhuqenntxiqurplenjn/sql/new

2. **Copy and paste** the entire contents of:
   ```
   supabase/migrations/20260110020000_trackier_integration_complete.sql
   ```

3. **Click "Run"** to execute

4. **Verify Success** (should see 4 tables):
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'trackier%'
   ORDER BY table_name;
   ```
   
   Expected output:
   - trackier_api_calls
   - trackier_offers
   - trackier_trace_history
   - trackier_webhook_logs

---

### Step 2: Start Frontend 🎨

Open terminal in project root:

```bash
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"

# Install dependencies (if needed)
npm install

# Start development server
npm run dev
```

**Frontend will run at**: http://localhost:5173

---

### Step 3: Start Backend (Optional for Webhook Testing) 🔧

If you want to test Trackier webhook functionality locally:

```bash
cd "/Users/geetsoni/Downloads/suffix-tool-main 2/proxy-service"

# Install dependencies (if needed)
npm install

# Start server
npm start
```

**Backend will run at**: http://localhost:3000

---

## Testing Features

### Test 1: Location Extraction ✅ (Already Deployed)

This feature is already deployed and working on EC2!

**To test via UI:**
1. Go to http://localhost:5173
2. Login to your account
3. Open any offer
4. Scroll to **Location Header Extraction** section
5. Toggle **"Extract from Location Header"**
6. Set **"Extract from hop"** (e.g., 1, 2, or leave blank for last)
7. Save offer
8. Trace the offer via edge functions

**Backend already has this working:**
- ✅ HTTP-only mode
- ✅ Browser mode
- ✅ Anti-cloaking mode
- ✅ Interactive mode
- ✅ Edge functions

---

### Test 2: Trackier Integration (NEW) 🆕

**To test P1-P10 Parameter Mapping:**

1. **Go to Offers** list at http://localhost:5173
2. **Click webhook icon** (⚡) on any offer
3. **Fill in Trackier Configuration**:
   ```
   API Key: your-trackier-api-key
   Advertiser ID: your-advertiser-id
   URL 1 Campaign ID: campaign-123
   URL 2 Campaign ID: campaign-456
   ```

4. **Configure P1-P10 Mapping** (scroll down to new section):
   ```
   p1: gclid
   p2: fbclid
   p3: msclkid
   p4: ttclid
   p5: clickid
   p6: utm_source
   p7: utm_medium
   p8: utm_campaign
   p9: custom1
   p10: custom2
   ```

5. **Save Configuration**

6. **Verify in Supabase**:
   ```sql
   SELECT 
     id, 
     offer_name, 
     sub_id_mapping, 
     enabled,
     created_at
   FROM trackier_offers
   ORDER BY created_at DESC
   LIMIT 1;
   ```

---

### Test 3: Webhook Endpoint (Backend Required) 🔗

**Start backend first** (Step 3 above), then:

```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/trackier-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "campaign-123",
    "click_id": "test-click-abc",
    "publisher_id": "2",
    "ip": "203.0.113.45",
    "country": "US",
    "device": "mobile",
    "p1": "test-gclid-12345",
    "p2": "test-fbclid-67890"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Webhook received and processing started",
  "click_id": "test-click-abc",
  "campaign_id": "campaign-123"
}
```

**Verify webhook logged:**
```sql
SELECT 
  id,
  campaign_id,
  click_id,
  publisher_id,
  payload,
  created_at
FROM trackier_webhook_logs
ORDER BY created_at DESC
LIMIT 1;
```

---

## What To Check

### ✅ Location Extraction (Already Working)
- [ ] UI shows location extraction toggle
- [ ] Can set hop number (1, 2, 3, etc.)
- [ ] Saves to database
- [ ] Works in all tracer modes
- [ ] Edge functions pass parameters correctly

### ✅ Trackier P1-P10 UI (Just Added)
- [ ] Webhook icon appears on offers
- [ ] TrackierSetup modal opens
- [ ] P1-P10 section visible
- [ ] Can edit parameter mappings
- [ ] Saves to trackier_offers table
- [ ] sub_id_mapping JSONB correct

### ✅ Trackier Webhook (Backend)
- [ ] Webhook endpoint responds
- [ ] Parameters extracted correctly
- [ ] Mapped to p1-p10 based on config
- [ ] Logs saved to database
- [ ] Background trace triggered

---

## Troubleshooting

### Frontend won't start
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend won't start
```bash
cd proxy-service
rm -rf node_modules package-lock.json
npm install
npm start
```

### Migration fails
- Check if tables already exist: `SELECT * FROM trackier_offers;`
- If error about existing tables, they're already created ✅
- If error about columns, run: `DROP TABLE trackier_offers CASCADE;` then re-run migration

### TrackierSetup UI not showing
- Clear browser cache
- Hard refresh: Cmd+Shift+R
- Check browser console for errors

### Webhook not receiving data
- Make sure backend is running on port 3000
- Check backend logs for errors
- Verify API credentials in trackier_offers table

---

## Success Checklist

- [x] Location extraction feature deployed to EC2 ✅
- [x] AMI created with latest code ✅
- [x] ASG updated to use new AMI ✅
- [ ] Trackier migration applied to Supabase
- [ ] Frontend shows P1-P10 UI
- [ ] Can save Trackier configuration
- [ ] Backend webhook receives test data

---

## Next Steps After Testing

1. **Deploy Frontend** to production (if UI looks good)
2. **Test with Real Trackier Campaigns**
3. **Monitor webhook logs** in production
4. **Validate end-to-end flow** with real clicks

---

## 🎯 Ready to Test!

Start with **Step 1** (apply migration), then **Step 2** (start frontend), then test each feature!
