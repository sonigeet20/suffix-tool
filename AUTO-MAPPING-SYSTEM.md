# Auto-Mapping System - Complete Flow

## Overview

The auto-mapping system automatically creates campaign mappings, Trackier campaigns, and webhooks when a Google Ads script runs for the first time. This eliminates manual setup and provides clear workflow visibility.

## How It Works

### 1. **Google Ads Script First Run**
```
Script runs in Google Ads account
↓
Detects campaign needs mapping
↓
Calls: POST /api/webhook-campaign/auto-create
{
  accountId: "123-456-7890",
  campaignId: "12345678",
  campaignName: "My Campaign",
  offerName: "ULTRAHUMAN_WW"
}
```

### 2. **Backend Auto-Creates Everything**
```
API checks if mapping exists
↓
If exists → returns existing mapping
↓
If not exists:
  - Creates Trackier campaign automatically
  - Creates webhook_campaign_mapping in database
  - Sets webhook_configured = false
  - Returns webhook URL for Trackier
```

### 3. **Frontend Shows Status**
```
Webhooks page displays:
- ⚠️ "Webhook Pending" badge (animated) = needs setup
- ✓ "Configured" badge = working
- Filter buttons: All | Configured | Pending
- Setup instructions shown for pending mappings
```

### 4. **User Adds Webhook to Trackier**
```
User copies webhook URL from:
  - Script logs, OR
  - Webhooks frontend page
↓
Goes to Trackier dashboard
↓
Adds S2S Postback URL to campaign
```

### 5. **System Auto-Detects Configuration**
```
First webhook arrives at: /api/webhook-suffix/receive/:campaignId
↓
Backend checks: webhook_configured === false
↓
Auto-updates:
  webhook_configured = true
  first_webhook_received_at = NOW()
↓
Frontend automatically shows "✓ Configured"
```

## API Endpoints

### Auto-Create Mapping
**POST** `/api/webhook-campaign/auto-create`

**Request:**
```json
{
  "accountId": "123-456-7890",
  "campaignId": "12345678",
  "campaignName": "My Campaign",
  "offerName": "ULTRAHUMAN_WW"
}
```

**Response (New Mapping):**
```json
{
  "success": true,
  "autoCreated": true,
  "mapping": {
    "mapping_id": "uuid",
    "account_id": "123-456-7890",
    "campaign_id": "12345678",
    "offer_name": "ULTRAHUMAN_WW",
    "trackier_campaign_id": 412,
    "trackier_webhook_url": "http://alb.../api/webhook-suffix/receive/412",
    "is_active": true,
    "webhook_configured": false,
    "created_by": "google_ads_script_auto"
  },
  "trackier": {
    "campaignId": 412,
    "webhookUrl": "http://alb.../api/webhook-suffix/receive/412",
    "clickUrl": "https://nebula.gotrackier.com/click?campaign_id=412"
  },
  "message": "Auto-mapping created!",
  "instructions": "⚠️ NEXT STEPS: Add webhook URL to Trackier..."
}
```

**Response (Already Exists):**
```json
{
  "success": true,
  "alreadyExists": true,
  "mapping": { ... },
  "trackier": { ... },
  "message": "Mapping already exists"
}
```

### Webhook Receiver (Auto-Marks as Configured)
**GET** `/api/webhook-suffix/receive/:trackierCampaignId?click_id={clickid}&...`

Automatically sets:
- `webhook_configured = true`
- `first_webhook_received_at = NOW()`

On first webhook received for a mapping.

### Manual Mark as Configured (Optional)
**PATCH** `/api/webhook-campaign/:mappingId/mark-configured`

Manually mark webhook as configured (rarely needed - auto-detection works).

## Database Schema Updates

```sql
-- Added to webhook_campaign_mappings table:
webhook_configured BOOLEAN DEFAULT false,
first_webhook_received_at TIMESTAMP,

-- New index:
CREATE INDEX idx_webhook_mappings_configured ON webhook_campaign_mappings(webhook_configured);
```

## Frontend Features

### Filter Buttons
- **All** - Shows all mappings
- **✓ Configured** - Only mappings with webhook working
- **⚠️ Pending** - Only mappings needing webhook setup

### Status Badges
- **Active/Inactive** - Campaign mapping status
- **⚠️ Webhook Pending** - Animated warning badge
- **✓ Configured** - Success badge with first webhook timestamp

### Setup Instructions
Pending mappings show:
```
⚠️ Add this to Trackier!

Setup Instructions:
1. Copy webhook URL above
2. Log in to Trackier dashboard
3. Go to Campaign #412
4. Add S2S Postback with this URL
5. System will auto-detect first webhook
```

Configured mappings show:
```
✅ Webhook configured and working!
First webhook received: 1/16/2026, 9:45 PM
```

## Google Ads Script Usage

### Example Script (see: google-ads-scripts/auto-mapping-example.gs)

```javascript
var PROXY_SERVICE_URL = 'http://your-alb-endpoint:3000';
var OFFER_NAME = 'ULTRAHUMAN_WW';

function main() {
  var accountId = AdsApp.currentAccount().getCustomerId();
  
  var campaigns = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .get();
  
  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    
    // Auto-create mapping if needed
    var result = ensureMappingExists(
      accountId,
      campaign.getId(),
      campaign.getName()
    );
    
    if (result.success && !result.mapping.webhook_configured) {
      Logger.log('⚠️ Webhook URL: ' + result.trackier.webhookUrl);
      Logger.log('   Add to Trackier Campaign ' + result.trackier.campaignId);
    }
  }
}
```

## Workflow Benefits

✅ **No Manual Mapping Creation** - Script creates everything automatically
✅ **No Manual Trackier Campaign Creation** - API handles it
✅ **Clear Status Visibility** - Frontend shows what needs attention
✅ **Auto-Detection** - System knows when webhook is working
✅ **Filtering** - Quickly find mappings needing setup
✅ **Instructions Included** - Clear steps shown in UI
✅ **Audit Trail** - Logs track auto-creation events

## Migration Path

### For Existing Mappings
Run this SQL in Supabase:
```sql
-- Add new columns to existing table
ALTER TABLE webhook_campaign_mappings 
ADD COLUMN IF NOT EXISTS webhook_configured BOOLEAN DEFAULT false;

ALTER TABLE webhook_campaign_mappings 
ADD COLUMN IF NOT EXISTS first_webhook_received_at TIMESTAMP;

-- Create index
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_configured 
ON webhook_campaign_mappings(webhook_configured);

-- Mark existing mappings as configured if they've received webhooks
UPDATE webhook_campaign_mappings
SET webhook_configured = true
WHERE mapping_id IN (
  SELECT DISTINCT mapping_id 
  FROM webhook_suffix_usage_log 
  WHERE action = 'applied'
);
```

### For New Deployments
Just run the updated `webhook_suffix_system.sql` migration file.

## Testing the Flow

### 1. Create Auto-Mapping
```bash
curl -X POST http://your-alb:3000/api/webhook-campaign/auto-create \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "123-456-7890",
    "campaignId": "99999999",
    "campaignName": "Test Auto Campaign",
    "offerName": "TEST_OFFER"
  }'
```

### 2. Check Frontend
- Go to Webhooks page
- Should see "⚠️ Webhook Pending" badge
- Setup instructions visible
- Filter by "Pending" should show it

### 3. Simulate Webhook
```bash
curl "http://your-alb:3000/api/webhook-suffix/receive/412?click_id=test123"
```

### 4. Verify Auto-Detection
- Refresh frontend
- Should now show "✓ Configured" badge
- Setup instructions replaced with success message
- Filter by "Configured" should show it

## Troubleshooting

### Mapping Not Auto-Creating
- Check script logs for API errors
- Verify PROXY_SERVICE_URL is correct
- Ensure backend routes are deployed

### Webhook Not Auto-Marking as Configured
- Check webhook receiver logs
- Verify Trackier is actually sending webhooks
- Test with manual webhook curl (see Testing section)

### Frontend Not Showing Status
- Refresh the page
- Check browser console for errors
- Verify API is returning webhook_configured field

## Next Steps

1. **Deploy database migration** - Run updated webhook_suffix_system.sql
2. **Deploy backend changes** - webhook-campaign.js and webhook-suffix-handler.js
3. **Deploy frontend changes** - WebhookCampaignMapper.tsx
4. **Test auto-mapping** - Use auto-mapping-example.gs script
5. **Monitor** - Check Webhooks page for pending setups
