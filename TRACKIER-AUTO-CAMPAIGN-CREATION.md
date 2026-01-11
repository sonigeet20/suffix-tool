# Trackier Auto-Campaign Creation Guide

## ✨ New Feature: Automatic Campaign Creation

The Trackier integration now includes **automatic campaign creation** via the Trackier API. No need to manually create campaigns in the Trackier dashboard!

## What Gets Created Automatically

When you click **"Create Campaigns"**, the system will:

1. **Create URL 2 (Final Campaign)**
   - Name: `{Offer Name} - Final (URL 2)`
   - Destination: Your affiliate URL
   - Purpose: Gets updated automatically with fresh suffixes
   - Status: Active

2. **Create URL 1 (Passthrough Campaign)**
   - Name: `{Offer Name} - Passthrough (URL 1)`
   - Destination: Points to URL 2 tracking link
   - Webhook: Configured automatically to your server
   - Purpose: Fires webhook on click, redirects to URL 2
   - Status: Active

3. **Generate Google Ads Template**
   - Properly formatted with all required macros
   - Includes: {gclid}, {lpurl}, {device}, {keyword}
   - Ready to paste into Google Ads

## How to Use

### Step 1: Validate Your API Credentials

1. Open the Trackier Setup modal (click ⚡ icon next to any offer)
2. Enter your Trackier API Key
3. Click **"Validate"** button
4. Wait for confirmation: "✓ API credentials validated!"

### Step 2: Auto-Create Campaigns

1. Click the **"Create Campaigns"** button (blue button in campaign section)
2. Wait 2-3 seconds while campaigns are created
3. Success! Campaign IDs will populate automatically

### Step 3: Save Configuration

1. Review the auto-populated campaign IDs:
   - URL 1 Campaign ID: `abc123` (auto-filled)
   - URL 2 Campaign ID: `xyz789` (auto-filled)
2. Configure update interval (default: 300 seconds)
3. Click **"Create Configuration"** or **"Update Configuration"**

### Step 4: Copy Google Ads Template

1. Scroll to "Google Ads Setup" section
2. Click **"Copy"** button next to the tracking template
3. Paste into Google Ads campaign settings

### Step 5: Test

1. Click **"Test Update"** button
2. Wait 12-30 seconds for trace to complete
3. Verify success message
4. Check Trackier dashboard: URL 2 destination should be updated

## API Endpoints

### POST /api/trackier-create-campaigns

Creates both URL 1 and URL 2 campaigns automatically.

**Request:**
```json
{
  "apiKey": "your_trackier_api_key",
  "apiBaseUrl": "https://api.trackier.com",
  "advertiserId": "optional_advertiser_id",
  "offerName": "ELCORTE_ES_SHEET_MOB",
  "finalUrl": "https://affiliate-network.com/click?...",
  "webhookUrl": "https://18.206.90.98:3000/api/trackier-webhook"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Campaigns created successfully",
  "campaigns": {
    "url1": {
      "id": "abc123",
      "name": "ELCORTE_ES_SHEET_MOB - Passthrough (URL 1)",
      "tracking_link": "https://gotrackier.com/click?campaign_id=abc123",
      "purpose": "Fires webhook, redirects to URL 2"
    },
    "url2": {
      "id": "xyz789",
      "name": "ELCORTE_ES_SHEET_MOB - Final (URL 2)",
      "tracking_link": "https://gotrackier.com/click?campaign_id=xyz789",
      "purpose": "Gets updated with fresh suffixes automatically"
    }
  },
  "googleAdsTemplate": "https://gotrackier.com/click?campaign_id=abc123&gclid={gclid}&source=google_ads&lpurl={lpurl}&device={device}&keyword={keyword}",
  "setup": {
    "nextStep": "Use the Google Ads template in your campaign settings",
    "webhook": "https://18.206.90.98:3000/api/trackier-webhook",
    "updateInterval": "Configure in UI (recommended: 300 seconds)"
  }
}
```

### POST /api/trackier-validate-credentials

Validates Trackier API credentials before creating campaigns.

**Request:**
```json
{
  "apiKey": "your_trackier_api_key",
  "apiBaseUrl": "https://api.trackier.com"
}
```

**Response (Valid):**
```json
{
  "valid": true,
  "message": "API credentials validated successfully",
  "accountInfo": {
    "totalCampaigns": 42,
    "apiVersion": "v2"
  }
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Invalid API key or insufficient permissions (401)"
}
```

## Google Ads Template Format

The auto-generated template includes all necessary macros:

```
https://gotrackier.com/click?campaign_id={URL1_ID}&gclid={gclid}&source=google_ads&lpurl={lpurl}&device={device}&keyword={keyword}&webhook_notify={WEBHOOK_URL}
```

**Macros included:**
- `{gclid}` - Google Click ID for conversion tracking
- `{lpurl}` - Landing page URL (final destination)
- `{device}` - Device type (mobile/desktop/tablet)
- `{keyword}` - Keyword that triggered the ad
- `{campaign_id}` - Trackier URL 1 campaign ID
- `{webhook_notify}` - Your webhook URL for click notifications

## Manual Campaign Creation (Alternative)

If you prefer to create campaigns manually in Trackier:

1. **Create URL 2 First:**
   - Go to Trackier Dashboard → Campaigns → Create
   - Name: `{Offer Name} - Final`
   - Destination: Your affiliate URL
   - Save and note the Campaign ID

2. **Create URL 1 Second:**
   - Go to Trackier Dashboard → Campaigns → Create
   - Name: `{Offer Name} - Passthrough`
   - Destination: URL 2 tracking link (from step 1)
   - Postback URL: `https://18.206.90.98:3000/api/trackier-webhook`
   - Postback Events: ☑ Click
   - Save and note the Campaign ID

3. **Enter IDs Manually:**
   - In TrackierSetup modal, enter both campaign IDs
   - Template will be generated automatically

## Troubleshooting

### Error: "Invalid API key or insufficient permissions"

**Solution:**
1. Verify API key is correct in Trackier Dashboard
2. Check API key has permission to create campaigns
3. Ensure API key is not expired

### Error: "Failed to create URL 2 campaign"

**Possible causes:**
1. Invalid advertiser_id (leave blank if unsure)
2. Campaign name already exists
3. URL format invalid
4. API rate limit exceeded

**Solution:**
- Check Trackier API logs in dashboard
- Try again with different campaign name
- Wait a few minutes and retry

### Error: "Failed to create URL 1 campaign"

**Possible causes:**
1. URL 2 was not created successfully
2. Webhook URL format invalid
3. Postback configuration not supported

**Solution:**
- Verify URL 2 exists in Trackier dashboard
- Check webhook URL is accessible: `curl https://18.206.90.98:3000/api/trackier-status`
- Create URL 1 manually if needed

### Campaigns Created But Template Not Generated

**Solution:**
1. Campaign IDs should auto-populate in form
2. Click "Save Configuration" to generate template
3. Template appears in "Google Ads Setup" section
4. If missing, refresh page and reopen modal

## Testing Campaign Creation

### Test with Mock Data (Local Development)

```bash
# Test credential validation
curl -X POST http://localhost:3000/api/trackier-validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your_test_api_key",
    "apiBaseUrl": "https://api.trackier.com"
  }'

# Test campaign creation (requires valid API key)
curl -X POST http://localhost:3000/api/trackier-create-campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your_api_key",
    "offerName": "TEST_OFFER",
    "finalUrl": "https://example.com/affiliate-link",
    "webhookUrl": "https://18.206.90.98:3000/api/trackier-webhook"
  }'
```

### Test with Real API Key

1. Get your Trackier API key from: Dashboard → Settings → API Keys
2. Click "Validate" in UI
3. Click "Create Campaigns"
4. Verify in Trackier dashboard: 2 new campaigns appear
5. Test URL 1 link: Should redirect to URL 2
6. Check webhook logs: `SELECT * FROM trackier_webhook_logs ORDER BY created_at DESC LIMIT 5;`

## Best Practices

### Campaign Naming

Auto-generated names follow this pattern:
- URL 1: `{Offer Name} - Passthrough (URL 1)`
- URL 2: `{Offer Name} - Final (URL 2)`

**Benefits:**
- Easy to identify in Trackier dashboard
- Clear purpose indication
- Consistent naming across all offers

### Update Intervals

Recommended intervals based on traffic:
- **High traffic (>1000 clicks/day)**: 300 seconds (5 min)
- **Medium traffic (100-1000 clicks/day)**: 600 seconds (10 min)
- **Low traffic (<100 clicks/day)**: 1800 seconds (30 min)

**Why?**
- Prevents Trackier API rate limiting
- Reduces unnecessary trace operations
- URL 2 always has fresh suffix pre-loaded

### Webhook Configuration

The webhook URL is configured automatically:
- Production: `https://18.206.90.98:3000/api/trackier-webhook`
- Accepts POST requests with click data
- Returns immediate 200 OK (async processing)
- Logs to `trackier_webhook_logs` table

**Firewall Requirements:**
- Port 3000 must be open on EC2
- Trackier IPs must be whitelisted (or disable firewall for testing)

## Advanced Configuration

### Custom Advertiser ID

If you have multiple advertisers in Trackier:
1. Enter Advertiser ID in "Trackier API Configuration" section
2. Campaigns will be created under that advertiser
3. Leave blank to use default advertiser

### Custom API Base URL

For testing or self-hosted Trackier:
1. Change "API Base URL" field
2. Default: `https://api.trackier.com`
3. Must be a valid Trackier API endpoint

### Custom Webhook URL

To use a different webhook endpoint:
1. Update webhook URL in campaign creation request
2. Ensure endpoint accepts POST with click data
3. Returns JSON: `{"success": true}`

## Migration from Manual Setup

If you already have manual campaigns:

**Option 1: Keep Existing Campaigns**
1. Enter existing campaign IDs manually
2. Don't click "Create Campaigns"
3. Save configuration
4. Template will be generated automatically

**Option 2: Replace with Auto-Created**
1. Note your current campaign IDs
2. Click "Create Campaigns" to create new ones
3. Update Google Ads with new template
4. Disable old campaigns in Trackier
5. Monitor for 24 hours before deleting old campaigns

## Monitoring

### Campaign Activity

Check campaign performance:
```sql
-- Recent webhooks by campaign
SELECT 
  campaign_id,
  COUNT(*) as clicks,
  MAX(created_at) as last_click
FROM trackier_webhook_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY campaign_id
ORDER BY clicks DESC;

-- Trace success rate by offer
SELECT 
  to.offer_name,
  COUNT(*) as total_traces,
  SUM(CASE WHEN th.success THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN th.success THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM trackier_trace_history th
JOIN trackier_offers to ON to.id = th.trackier_offer_id
GROUP BY to.offer_name;
```

### Backend Logs

```bash
# Campaign creation logs
pm2 logs | grep "Trackier Create"

# API call logs
pm2 logs | grep "Trackier API"

# Validation logs
pm2 logs | grep "Trackier Validate"
```

## FAQ

**Q: Can I create campaigns for multiple offers at once?**
A: Currently, campaigns are created one offer at a time. You can automate this via API if needed.

**Q: What happens if campaign creation fails halfway?**
A: URL 2 is created first. If URL 1 fails, you can create it manually and enter the ID.

**Q: Can I rename campaigns after creation?**
A: Yes, rename in Trackier dashboard. Campaign IDs won't change.

**Q: Do I need to update Google Ads if I recreate campaigns?**
A: Yes, the campaign ID in the template will change. Update Google Ads with the new template.

**Q: How do I delete auto-created campaigns?**
A: Disable in UI first (toggle off), then delete in Trackier dashboard.

**Q: Can I use the same campaigns for multiple offers?**
A: Not recommended. Each offer should have its own URL 1 and URL 2 pair.

## Support

For issues with campaign creation:
1. Check backend logs: `pm2 logs | grep Trackier`
2. Verify API credentials: Click "Validate" button
3. Check Trackier dashboard: Are campaigns visible?
4. Test webhook: `curl https://18.206.90.98:3000/api/trackier-status`
5. Review API documentation: [TRACKIER-INTEGRATION-GUIDE.md](TRACKIER-INTEGRATION-GUIDE.md)

---

**Feature Added:** January 9, 2026
**Status:** ✅ Production Ready
**API Version:** Trackier v2
