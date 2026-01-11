# Complete Trackier Configuration Guide

## Overview
This guide walks you through setting up a complete Trackier dual-URL tracking system with webhook parameter passing.

## System Architecture

```
Click → Campaign 310 (URL 1 - Passthrough)
  ↓ (fires webhook)
Server extracts parameters
  ↓
Injects params into Campaign 309 URL
  ↓
Campaign 310 redirects → Campaign 309 (URL 2 - Final)
  ↓
Campaign 309 redirects → Final URL (e.g., elcorteingles.es with params)
```

---

## Step 1: Create Campaign 310 (URL 1 - Passthrough Campaign)

### In Trackier Dashboard:

1. **Go to Campaigns** → Click **Create Campaign**

2. **Basic Settings:**
   - **Campaign Name:** `Passthrough Campaign (URL 1)` (or your choice)
   - **Campaign Type:** Select appropriate type (CPA/CPL/etc)
   - **Advertiser:** Select your advertiser
   - **Status:** Active

3. **Tracking Settings:**
   - **Campaign URL:** 
     ```
     https://nebula.gotrackier.com/click?campaign_id=310&pub_id=2&force_transparent=true&url=[PLACEHOLDER_FOR_CAMPAIGN_309]
     ```
   - **Note:** Replace `[PLACEHOLDER_FOR_CAMPAIGN_309]` with actual encoded URL (we'll do this after creating Campaign 309)

4. **Server Side Clicks (IMPORTANT):**
   - ✅ Enable **"Server Side Clicks"** toggle
   - Paste **S2S Push URL:**
     ```
     http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-webhook
     ```
   - Save this section

5. **Save Campaign** - Get the Campaign ID (should be 310)

---

## Step 2: Create Campaign 309 (URL 2 - Final Campaign)

### In Trackier Dashboard:

1. **Go to Campaigns** → Click **Create Campaign**

2. **Basic Settings:**
   - **Campaign Name:** `Final Campaign (URL 2)` (or your choice)
   - **Campaign Type:** Same as Campaign 310
   - **Advertiser:** Same as Campaign 310
   - **Status:** Active

3. **Tracking Settings:**
   - **Campaign URL:** 
     ```
     https://nebula.gotrackier.com/click?campaign_id=309&pub_id=2&force_transparency=true&url=https%3A%2F%2Fwww.elcorteingles.es%2F
     ```
   - Replace `https://www.elcorteingles.es/` with your actual final landing page

4. **Save Campaign** - Get the Campaign ID (should be 309)

---

## Step 3: Update Campaign 310 with Campaign 309 URL

### Go back to Campaign 310:

1. **Edit Campaign 310**
2. **Update Campaign URL** to include encoded Campaign 309 URL:
   ```
   https://nebula.gotrackier.com/click?campaign_id=310&pub_id=2&force_transparent=true&url=https%3A%2F%2Fnebula.gotrackier.com%2Fclick%3Fcampaign_id%3D309%26pub_id%3D2%26force_transparency%3Dtrue%26url%3Dhttps%253A%252F%252Fwww.elcorteingles.es%252F
   ```

3. **Verify Server Side Clicks is still enabled** with webhook URL
4. **Save**

---

## Step 4: Configure in URL Tracker UI

### In your URL Tracker application:

1. **Go to Offers**
2. **Create New Offer** or **Edit Existing Offer**
3. **Find Trackier Setup button** (webhook icon)

4. **Fill in:**
   - **API Key:** Your Trackier API key
   - **API Base URL:** `https://api.trackier.com`
   - **Advertiser ID:** Your advertiser ID from Trackier
   - **Publisher ID:** `2` (or your publisher ID)
   
   - **URL 1 Campaign ID:** `310`
   - **URL 1 Campaign Name:** `Passthrough Campaign (URL 1)`
   
   - **URL 2 Campaign ID:** `309`
   - **URL 2 Campaign Name:** `Final Campaign (URL 2)`
   - **URL 2 Destination URL:** `https://www.elcorteingles.es/` (your final URL)
   
   - **Update Interval Seconds:** `1` (for fast updates)
   - **Google Ads Tracking Template:** Will be auto-generated

5. **Click "Create Configuration"**

---

## Step 5: Understand the Parameter Flow

### Parameters Extracted:
When someone clicks Campaign 310, Trackier's webhook sends these parameters (if present):

| Parameter | Source | Example |
|-----------|--------|---------|
| `clickid` | Trackier | `abc123xyz` |
| `gclid` | Google Ads | `CjwKCAiA4t... ` |
| `fbclid` | Facebook | `IwAR0vp9j... ` |
| `msclkid` | Microsoft | `ABC123` |
| `ttclid` | TikTok | `v_123456` |
| `utm_source` | UTM | `google` |
| `utm_medium` | UTM | `cpc` |
| `utm_campaign` | UTM | `summer_sale` |

### Parameter Mapping (p1-p10):
The server maps parameters to Trackier's p1-p10 slots:

```
p1 → gclid (Google)
p2 → fbclid (Facebook)
p3 → msclkid (Microsoft)
p4 → ttclid (TikTok)
p5 → clickid (Generic)
p6 → utm_source
p7 → utm_medium
p8 → utm_campaign
p9 → custom1
p10 → custom2
```

---

## Step 6: Testing the Setup

### Test Flow:

1. **Generate a test URL with parameters:**
   ```
   https://nebula.gotrackier.com/click?campaign_id=310&pub_id=2&force_transparent=true&url=https%3A%2F%2Fnebula.gotrackier.com%2Fclick%3Fcampaign_id%3D309%26pub_id%3D2%26force_transparency%3Dtrue%26url%3Dhttps%253A%252F%252Fwww.elcorteingles.es%252F&gclid=TEST123&utm_source=test_source
   ```

2. **Visit the URL** and follow the redirects

3. **Check the logs:**
   - Look for webhook entry in `trackier_webhook_logs` table
   - Parameters should be in `sub_id_values` JSONB column

4. **Verify in Analytics:**
   - Go to Analytics tab in URL Tracker
   - Look for recent requests with your test parameters

---

## Step 7: Google Ads Integration

### Using the Tracking Template:

1. In URL Tracker, **Copy the Tracking Template** generated for your offer

2. In Google Ads, **Add as Campaign Tracking Template:**
   ```
   (The template will look like)
   https://nebula.gotrackier.com/click?campaign_id=310&pub_id=2&force_transparent=true&url=https%3A%2F%2Fnebula.gotrackier.com%2Fclick%3Fcampaign_id%3D309%26pub_id%3D2%26force_transparency%3Dtrue%26url%3Dhttps%253A%252F%252Fwww.elcorteingles.es%252F{lpurl}
   ```

3. **Google will automatically:**
   - Add `gclid` parameter automatically
   - Use this template for all ads in the campaign

---

## Step 8: Parameter Passing Flow (Behind the Scenes)

### When a click happens:

1. **User clicks** your ad
   - Browser goes to Campaign 310 URL with `gclid=...`
   
2. **Trackier fires webhook** to your server
   - POST data includes: `gclid`, `clickid`, and any UTM parameters
   
3. **Your webhook handler:**
   - Extracts parameters from POST body
   - Builds enriched Campaign 309 URL with parameters as query strings
   - Stores parameters in database for real-time access
   
4. **Campaign 310 redirects:**
   - Passes enriched Campaign 309 URL
   - Browser follows redirect
   
5. **Campaign 309 redirects:**
   - Passes final URL with all original parameters preserved
   - User lands on final page with tracking parameters

---

## Step 9: Monitoring & Troubleshooting

### Check Webhook Logs:

```sql
-- Query recent webhooks
SELECT 
  id,
  campaign_id,
  created_at,
  webhook_data,
  sub_id_values
FROM trackier_webhook_logs
ORDER BY created_at DESC
LIMIT 20;
```

### Check Extracted Parameters:

```sql
-- View stored parameters
SELECT 
  offer_name,
  sub_id_values,
  updated_at
FROM trackier_offers
WHERE offer_name = 'YOUR_OFFER_NAME';
```

### Common Issues:

| Issue | Solution |
|-------|----------|
| No webhooks received | Check S2S Push URL is set in Campaign 310 |
| Parameters are empty | Ensure `gclid`, `utm_*` are being sent to Campaign 310 |
| Wrong campaign ID | Verify campaign_id in URL matches actual Trackier campaign |
| Parameters not injected | Check webhook handler has correct mapping (p1-p10) |

---

## Step 10: Configuration in UI

### Screenshots of where to enter data:

**In Trackier Setup Modal:**

```
┌─────────────────────────────────────────┐
│   Trackier Dual-URL Setup               │
├─────────────────────────────────────────┤
│ API Key:        [sk_live_...]           │
│ API Base URL:   [https://api.trackier...│
│ Advertiser ID:  [123456]                │
│ Publisher ID:   [2]                     │
│                                         │
│ URL 1 Campaign ID:    [310]             │
│ URL 1 Campaign Name:  [Passthrough...   │
│                                         │
│ URL 2 Campaign ID:    [309]             │
│ URL 2 Campaign Name:  [Final Campaign.. │
│ URL 2 Destination:    [https://www...   │
│                                         │
│ Update Interval:      [1] seconds       │
│                                         │
│ [Create Configuration] [Test] [Close]   │
└─────────────────────────────────────────┘
```

---

## Configuration Checklist

- [ ] Campaign 310 created with proper tracking URL
- [ ] Campaign 309 created with final landing page
- [ ] Campaign 310 URL updated to include Campaign 309 URL
- [ ] S2S Push URL configured in Campaign 310:
  - `http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-webhook`
- [ ] Offer created in URL Tracker
- [ ] Trackier Setup configured with both campaign IDs
- [ ] Google Ads template copied and set in GA campaigns
- [ ] Test click sent with `gclid` or `utm_*` parameters
- [ ] Webhook logs show incoming clicks
- [ ] Parameters visible in `trackier_offers.sub_id_values`
- [ ] Final URL receives parameters correctly

---

## Example Complete URL

Here's a real example of what the final tracking URL should look like:

```
https://nebula.gotrackier.com/click?campaign_id=310&pub_id=2&force_transparent=true&url=https%3A%2F%2Fnebula.gotrackier.com%2Fclick%3Fcampaign_id%3D309%26pub_id%3D2%26force_transparency%3Dtrue%26url%3Dhttps%253A%252F%252Fwww.elcorteingles.es%252F
```

**Decoded for readability:**
```
https://nebula.gotrackier.com/click?
  campaign_id=310&
  pub_id=2&
  force_transparent=true&
  url=https://nebula.gotrackier.com/click?
    campaign_id=309&
    pub_id=2&
    force_transparency=true&
    url=https://www.elcorteingles.es/
```

---

## Support

If webhooks aren't working:
1. Check AWS ALB logs for incoming requests
2. Verify S2S URL is exact in Trackier (no trailing slashes)
3. Test with: `curl -X POST http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-webhook -d "test=1"`
4. Check Supabase function logs for edge function errors
