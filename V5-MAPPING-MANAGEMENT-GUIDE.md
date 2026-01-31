# V5 Campaign Mapping Management Guide

**Status**: ✅ Live in V5WebhookManager component  
**Commit**: 8c3a7d3

## New Features

### 1. Delete Mapping Button ❌

**Location**: Expanded view of each mapping (red danger button in top-right)

**What it does**:
- Removes the campaign mapping from the database
- Cascade deletes associated Trackier campaign link
- Requires confirmation before deletion

**When to use**:
- Campaign no longer needs tracking
- Incorrect mapping that needs to be recreated
- Cleaning up test/trial mappings

**Steps**:
1. Click on a mapping to expand it
2. Scroll to the top of the expanded details
3. Click "Delete Mapping" (red button)
4. Confirm the deletion
5. Mapping list auto-refreshes

**What happens after**:
- Mapping is removed from `v5_campaign_offer_mapping` table
- Trackier campaign link deleted from mapping record
- Google Ads campaign stops receiving suffix updates (no queue processing)
- Suffix bucket data remains intact (can be reused)

---

### 2. Create Trackier Campaign Button ⚡

**Location**: Expanded view when Trackier campaign NOT yet created (warning area)

**What it does**:
- Auto-creates Trackier campaign with 200_hrf redirect
- Generates tracking template with campaign_id macro
- Creates webhook postback URL
- Links everything to the mapping

**When to use**:
- You have a mapping but Trackier campaign wasn't created
- Manually created mappings need Trackier setup
- Re-creating after accidental deletion

**Steps**:
1. Click on a mapping to expand it
2. Look for warning: "⚠️ Trackier campaign not yet created"
3. Click "Create Trackier" button (warning area)
4. Wait for confirmation alert
5. Expanded view updates with new campaign details

**What happens after**:
- New Trackier campaign created in your Trackier account
- Campaign ID stored in `v5_trackier_campaigns` table
- Tracking template ready to copy to Google Ads
- Webhook URL ready to add to Trackier postback settings
- Google Ads script can now process webhooks for this mapping

---

## Mapping States

### State 1: ✅ Complete (Trackier Created)
```
✓ Campaign mapping exists
✓ Trackier campaign created
✓ Tracking template generated
✓ Webhook URL configured
✓ Ready for webhook processing
```

**Buttons visible**:
- Delete Mapping (red)
- Manual Trace Trigger
- Copy Tracking Template
- Copy Webhook URL

**Status indicators**:
- "200_hrf" badge (redirect type)
- Green "Active" badge

---

### State 2: ⚠️ Incomplete (Trackier NOT Created)
```
✓ Campaign mapping exists
✗ Trackier campaign NOT created
✗ Tracking template NOT generated
✗ Webhook URL NOT configured
✗ NOT ready for webhook processing
```

**Buttons visible**:
- Delete Mapping (red)
- Create Trackier (orange warning area)

**Status indicators**:
- Warning message
- No "200_hrf" badge
- May show "Auto" badge (if auto-created)

---

## Workflow Examples

### Example 1: Start Fresh for New Campaign

1. **Create Mapping** (via "Create Mapping" button)
   - Enter Account ID: `1234567890`
   - Enter Google Campaign ID: `9876543210`
   - Select Offer: `OFFER_NAME`

2. **Auto-Setup** (if first account)
   - Script detects enabled campaigns
   - v5-auto-setup creates Trackier campaign automatically
   - Mapping auto-linked to Trackier

3. **Configure** (if manual link needed)
   - Expand mapping card
   - Trackier campaign already created ✓
   - Copy Tracking Template
   - Copy Webhook URL
   - Configure in Google Ads and Trackier

---

### Example 2: Manually Created Mapping Needs Trackier

1. **See Warning**
   - Expand mapping card
   - Warning shows: "Trackier campaign not yet created"

2. **Auto-Create Trackier**
   - Click "Create Trackier" button
   - System creates campaign + template + webhook
   - Alert confirms success

3. **Copy & Configure**
   - Tracking Template appears
   - Webhook URL appears
   - Copy both to Google Ads and Trackier

---

### Example 3: Remove Old Campaign

1. **Expand Mapping**
   - Find the campaign mapping
   - Click to expand

2. **Delete**
   - Scroll to top of expanded view
   - Click red "Delete Mapping" button
   - Confirm deletion

3. **Cleanup** (optional)
   - Remove tracking template from Google Ads campaign
   - Remove webhook URL from Trackier postback settings

---

## Common Issues & Solutions

### Issue 1: "Trackier campaign not yet created" warning persists

**Possible causes**:
1. v5-auto-setup didn't run (new account)
2. v5-create-mapping button wasn't clicked
3. Trackier API credentials not configured

**Solution**:
1. Verify Trackier API key in Settings
2. Click "Create Trackier" button to manually create
3. If fails, check Trackier API error in browser console

---

### Issue 2: Delete button missing

**Possible causes**:
1. Mapping not expanded yet
2. Viewing collapsed view only

**Solution**:
1. Click on the mapping row to expand it
2. Red "Delete Mapping" button appears at top

---

### Issue 3: Can't delete mapping

**Possible causes**:
1. Active webhooks still in queue (queue doesn't block delete)
2. Database permissions issue
3. Foreign key constraint

**Solution**:
1. Check for pending webhooks in queue stats
2. Wait for queue to be processed
3. Try deleting again
4. If still failing, check browser console for error

---

## API Integration

### Delete Mapping
```typescript
const { error } = await supabase
  .from('v5_campaign_offer_mapping')
  .delete()
  .eq('id', mappingId);
```

Removes row from `v5_campaign_offer_mapping` table.

---

### Create Trackier Campaign

Calls `v5-create-mapping` edge function with:

```json
{
  "account_id": "1234567890",
  "google_campaign_id": "9876543210",
  "offer_name": "OFFER_NAME"
}
```

Returns:
```json
{
  "success": true,
  "trackier": {
    "campaignId": "12345",
    "campaignName": "V5-OFFER_NAME",
    "trackingTemplate": "https://nebula.gotrackier.com/...",
    "webhookUrl": "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/v5-webhook-conversion",
    "redirectType": "200_hrf"
  }
}
```

---

## Database Changes

### v5_campaign_offer_mapping
```sql
-- Delete mapping
DELETE FROM v5_campaign_offer_mapping WHERE id = 'mapping-uuid';

-- Cascade deletes:
-- - v5_trackier_campaigns.mapping_id (if FK exists)
-- - Associated webhook queue items (if implemented)
```

### v5_trackier_campaigns
```sql
-- Records created when "Create Trackier" button clicked
INSERT INTO v5_trackier_campaigns (
  offer_name,
  trackier_campaign_id,
  trackier_campaign_name,
  webhook_url,
  tracking_template,
  redirect_type
) VALUES (...);
```

---

## Button Placement Reference

### When Trackier EXISTS (Mapping Complete)

```
┌─────────────────────────────────────────────────┐
│ [Expanded] ↓ OFFER_NAME • Campaign ID • Trackier #123 │
│   Active   Auto   200_hrf                    │
├─────────────────────────────────────────────────┤
│  [Delete Mapping] ← Red button here           │
│                                                 │
│  ▪ Manual trace (account scope)                 │
│    [Trigger]                                    │
│                                                 │
│  ▪ Tracking Template (Add to Google Ads)        │
│    [Copy] https://nebula.gotrackier.com/...    │
│                                                 │
│  ▪ Postback URL (Add to Trackier)               │
│    [Copy] https://rfhuqenntxiqurplenjn...      │
│                                                 │
│  ▪ Trace override                               │
│    [Enabled] [Traces/Day] [Speed x] [Save]     │
└─────────────────────────────────────────────────┘
```

---

### When Trackier MISSING (Mapping Incomplete)

```
┌─────────────────────────────────────────────────┐
│ [Expanded] ↓ OFFER_NAME • Campaign ID • Account │
│   Active   Auto                              │
├─────────────────────────────────────────────────┤
│  [Delete Mapping] ← Red button here           │
│                                                 │
│ ⚠️ Trackier campaign not yet created          │
│    Click below to auto-create the Trackier     │
│    campaign, tracking template, and webhook    │
│                               [Create Trackier]│
└─────────────────────────────────────────────────┘
```

---

## Recent Changes (Commit 8c3a7d3)

- ✅ Added `deleteMapping()` function
- ✅ Added `createTrackierCampaign()` function
- ✅ Added Delete Mapping button to expanded view
- ✅ Added Create Trackier button to incomplete state
- ✅ Auto-refresh after actions
- ✅ Confirmation dialogs before destructive actions

---

## Next Steps

1. **Test Delete**: Try deleting a test mapping
2. **Test Create**: Create a mapping without Trackier, then auto-create
3. **Monitor Logs**: Check browser console for any errors
4. **Verify Queue**: Confirm webhooks process after Trackier creation
5. **Document Limits**: Consider max API calls from rapid creation/deletion

