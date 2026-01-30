# GCLID-Based Conversion Tracking for Google Ads

## Overview

This system enables conversion tracking for Google Ads when using parallel tracking with affiliate networks. Since parallel tracking uses `navigator.sendBeacon()` which doesn't allow cookies to be set in the user's browser, we use GCLID (Google Click ID) as the attribution identifier.

## How It Works

### 1. **Token-Based URL Configuration**

Instead of hardcoding parameter names, you configure a token in your Google Ads setup:

```
gclid_param_token: "xcust"  (for Skimlinks)
gclid_param_token: "subid"  (for other networks)
```

### 2. **Tracking URL Template**

In your `silent_fetch_tracking_url`, use the `{gclid}` token where you want the GCLID to be injected:

**Example for Skimlinks:**
```
https://go.skimresources.com?id=123456&url=https://merchant.com&{gclid}
```

**At runtime, this becomes:**
```
https://go.skimresources.com?id=123456&url=https://merchant.com&xcust=Cj0KCQiA...
```

### 3. **Google Ads Tracking Template**

In your Google Ads tracking template, pass the GCLID to your click endpoint:

```
https://your-domain.com/click?offer_name=my_offer&redirect_url={lpurl}&gclid={gclid}
```

**Google replaces `{gclid}` with actual click ID:**
```
https://your-domain.com/click?offer_name=my_offer&redirect_url=https://merchant.com&gclid=Cj0KCQiA...
```

### 4. **Click Flow**

1. User clicks Google Ad → Google's parallel tracking fires
2. `navigator.sendBeacon()` sends POST to `/click` endpoint
3. Server extracts `gclid` from request
4. Server replaces `{gclid}` token in tracking URL with `xcust=Cj0KCQiA...`
5. Server hits tracking URL with residential proxy (matching user's country)
6. Affiliate network receives click with GCLID as custom parameter
7. GCLID mapping stored in database for conversion attribution

### 5. **Conversion Flow**

1. User completes conversion on merchant site
2. Affiliate network fires postback to `/conversion` endpoint
3. Postback includes `xcust=Cj0KCQiA...` (the GCLID)
4. Server looks up GCLID in `gclid_click_mapping` table
5. Conversion stored in `google_ads_conversions` table
6. (Future) Report conversion to Google Ads API

## Configuration

### Database Setup

Run the migration:
```sql
supabase/migrations/20260201000001_add_gclid_tracking_tables.sql
```

This creates:
- `gclid_click_mapping` - Maps GCLID to offer/click data
- `google_ads_conversions` - Stores conversion events
- `google_ads_config.gclid_param_token` - Network parameter name
- `google_ads_config.use_residential_proxy_for_tracking` - Enable proxy

### Google Ads Config

Set in your `google_ads_config` table:

```sql
UPDATE google_ads_config
SET 
  gclid_param_token = 'xcust',  -- For Skimlinks
  use_residential_proxy_for_tracking = TRUE,
  silent_fetch_tracking_url = 'https://go.skimresources.com?id=123456&url=https://merchant.com&{gclid}'
WHERE offer_name = 'my_offer';
```

### Affiliate Network Postback URL

Configure in your affiliate network dashboard:

**Skimlinks:**
```
https://your-domain.com/conversion?click_id={xcust}&payout={payout}&status=approved
```

**Generic:**
```
https://your-domain.com/conversion?click_id={subid}&payout={commission}&status={status}
```

## Residential Proxy Support

The system automatically uses residential proxies for tracking requests to:
- Match the user's country (IP geolocation)
- Avoid detection as server-side traffic
- Ensure affiliate network accepts the click

Configure residential proxy in `proxy_providers`:

```sql
INSERT INTO proxy_providers (user_id, name, provider_type, username, password, host, port, enabled)
VALUES ('your-user-id', 'BrightData Residential', 'brightdata_residential', 
        'brd-customer-xxx-zone-yyy', 'password', 'brd.superproxy.io', 22225, true);
```

## API Endpoints

### POST /click
Handles Google Ads parallel tracking clicks with GCLID injection.

**Parameters:**
- `offer_name` - Offer identifier
- `redirect_url` - Landing page URL
- `gclid` - Google Click ID (from tracking template)

**Response:** `204 No Content` (for POST) or HTML with client-side tracking (for GET)

### GET/POST /conversion
Receives conversion postbacks from affiliate networks.

**Parameters:**
- `click_id` or `xcust` - Custom parameter containing GCLID
- `payout` - Conversion value
- `status` - Conversion status (approved, pending, rejected)
- `currency` - Currency code

**Response:**
```json
{
  "status": "success",
  "conversion_id": "uuid",
  "gclid": "Cj0KCQiA...",
  "offer_name": "my_offer"
}
```

## Example Flow

### Skimlinks Integration

**1. Google Ads Tracking Template:**
```
https://tracker.example.com/click?offer_name=amazon&redirect_url={lpurl}&gclid={gclid}
```

**2. Google Ads Config:**
```json
{
  "offer_name": "amazon",
  "gclid_param_token": "xcust",
  "silent_fetch_tracking_url": "https://go.skimresources.com?id=123456X789&url=https://amazon.com/product&{gclid}",
  "use_residential_proxy_for_tracking": true
}
```

**3. Runtime Transformation:**
```
Input GCLID: Cj0KCQiA_-69BhDSSARIsADKM63...

Tracking URL becomes:
https://go.skimresources.com?id=123456X789&url=https://amazon.com/product&xcust=Cj0KCQiA_-69BhDSSARIsADKM63...
```

**4. Skimlinks Postback URL:**
```
https://tracker.example.com/conversion?click_id={xcust}&payout={rate}&status=approved
```

**5. Conversion Attribution:**
```
Skimlinks fires postback with xcust=Cj0KCQiA_-69BhDSSARIsADKM63...
System looks up GCLID → finds offer=amazon, stores conversion
```

## Benefits

✅ **No Cookie Dependence** - Works with parallel tracking's POST-only requests  
✅ **Network Agnostic** - Configure any parameter name via token  
✅ **Proxy Support** - Residential proxies match user's country  
✅ **Database Tracking** - Full audit trail of clicks and conversions  
✅ **Future-Proof** - Ready for Google Ads API conversion reporting  

## Database Schema

### gclid_click_mapping
```sql
id            UUID PRIMARY KEY
gclid         TEXT NOT NULL        -- Google Click ID
offer_name    TEXT NOT NULL        -- Offer identifier
click_id      TEXT                 -- Affiliate network click ID (if different)
client_country TEXT                -- User's country
client_ip     TEXT                 -- User's IP
user_agent    TEXT                 -- Browser user agent
tracking_url  TEXT                 -- Full tracking URL with GCLID
landing_url   TEXT                 -- Final landing page
created_at    TIMESTAMPTZ
```

### google_ads_conversions
```sql
id                    UUID PRIMARY KEY
gclid                 TEXT NOT NULL        -- Google Click ID
offer_name            TEXT NOT NULL        -- Offer identifier
click_id              TEXT                 -- Affiliate network click ID
conversion_value      DECIMAL(10,2)        -- Payout amount
conversion_currency   TEXT DEFAULT 'USD'   -- Currency
conversion_label      TEXT                 -- Google Ads label
postback_data         JSONB                -- Raw postback data
reported_to_google    BOOLEAN DEFAULT FALSE
google_report_status  TEXT                 -- API response status
created_at            TIMESTAMPTZ
reported_at           TIMESTAMPTZ
```

## Troubleshooting

### GCLID not appearing in logs
- Check Google Ads tracking template includes `&gclid={gclid}`
- Verify parallel tracking is enabled in Google Ads
- Test with real Google Ad click (not direct URL)

### Tracking URL not receiving GCLID
- Verify `gclid_param_token` is set in google_ads_config
- Check `{gclid}` token exists in silent_fetch_tracking_url
- Look for warnings in server logs

### Conversions not matching
- Confirm affiliate network postback includes correct parameter
- Verify parameter name matches `gclid_param_token`
- Check `gclid_click_mapping` table has the click record

### Proxy not working
- Verify residential proxy provider is enabled in proxy_providers
- Check provider credentials are correct
- Test proxy connection independently

## Future Enhancements

- [ ] Google Ads API integration for automatic conversion reporting
- [ ] Conversion value optimization based on payout data
- [ ] Multi-touch attribution for multiple clicks
- [ ] Real-time conversion dashboard
- [ ] Automated conversion sync with Google Ads
