# Google Ads Bot & IP Filtering Configuration

## Overview
The Google Ads click handler includes comprehensive bot detection and IP filtering to protect your tracking budget and ensure quality clicks.

## Configuration Location
All filtering rules are stored in the `offers.google_ads_config.filtering` JSON object in the database.

## Configuration Structure

```json
{
  "enabled": true,
  "google_ads_config": {
    "enabled": true,
    "filtering": {
      "enabled": true,
      "bot_detection": true,
      "bot_patterns": ["bot", "crawl", "spider", "scrape"],
      "ip_blacklist": ["1.2.3.4", "5.6.7.8"],
      "ip_whitelist": [],
      "blocked_countries": ["CN", "RU"],
      "allowed_countries": [],
      "rate_limit": {
        "enabled": true,
        "max_clicks_per_ip": 10,
        "window_minutes": 60
      },
      "block_datacenters": false
    }
  }
}
```

## Filtering Rules

### 1. Bot Detection (`bot_detection`)
**Default:** `true` (enabled by default)
**Description:** Blocks requests with bot-like User-Agent strings

**Default Bot Patterns:**
- `/bot/i` - Generic bots (Googlebot, etc.)
- `/crawl/i` - Crawlers
- `/spider/i` - Spiders
- `/scrape/i` - Scrapers
- `/curl/i` - cURL requests
- `/wget/i` - Wget requests
- `/python/i` - Python scripts
- `/java(?!script)/i` - Java clients (not JavaScript)
- `/go-http/i` - Go HTTP clients
- `/okhttp/i` - OkHttp library
- `/axios/i` - Axios library
- `/fetch/i` - Fetch API
- `/http\.client/i` - Generic HTTP clients
- `/urllib/i` - Python urllib
- `/requests/i` - Python requests library
- `/headless/i` - Headless browsers
- `/phantom/i` - PhantomJS
- `/selenium/i` - Selenium automation
- `/puppeteer/i` - Puppeteer automation

**Custom Patterns:**
```json
{
  "bot_patterns": [
    "/custombot/i",
    "/mybadbot/i"
  ]
}
```

**Disable Bot Detection:**
```json
{
  "bot_detection": false
}
```

### 2. IP Blacklist (`ip_blacklist`)
**Default:** `[]` (empty)
**Description:** Blocks specific IP addresses

```json
{
  "ip_blacklist": [
    "192.168.1.100",
    "10.0.0.50"
  ]
}
```

### 3. IP Whitelist (`ip_whitelist`)
**Default:** `[]` (empty)
**Description:** Only allows specific IP addresses (overrides all other rules)

```json
{
  "ip_whitelist": [
    "203.0.113.10",
    "198.51.100.25"
  ]
}
```

⚠️ **Warning:** If whitelist is set, ONLY these IPs will be allowed!

### 4. Country Blocking (`blocked_countries`)
**Default:** `[]` (empty)
**Description:** Blocks clicks from specific countries

```json
{
  "blocked_countries": ["CN", "RU", "NG"]
}
```

### 5. Country Whitelist (`allowed_countries`)
**Default:** `[]` (empty)
**Description:** Only allows clicks from specific countries

```json
{
  "allowed_countries": ["US", "GB", "CA", "AU"]
}
```

⚠️ **Warning:** If set, ONLY these countries will be allowed!

### 6. Rate Limiting (`rate_limit`)
**Default:** Disabled
**Description:** Limits clicks per IP address within a time window

```json
{
  "rate_limit": {
    "enabled": true,
    "max_clicks_per_ip": 5,
    "window_minutes": 60
  }
}
```

This blocks IPs that exceed 5 clicks in 60 minutes.

### 7. Datacenter Detection (`block_datacenters`)
**Default:** `false`
**Description:** Blocks requests from known datacenter IP ranges (future feature)

```json
{
  "block_datacenters": true,
  "datacenter_asn_list": [
    "AS16509", // AWS
    "AS15169"  // Google Cloud
  ]
}
```

## Priority Order

Filtering checks run in this order:
1. Bot Detection
2. IP Whitelist (if set, skips all other checks)
3. IP Blacklist
4. Country Whitelist (if set)
5. Country Blacklist
6. Rate Limiting

## Behavior with `force_transparent=true`

When Google Ads includes `force_transparent=true`:
- **Blocked clicks:** Still redirect (without suffix) even if blocked
- **Logging:** Blocked clicks are logged with `blocked=true` and `block_reason`
- **Purpose:** Ensures Google Ads always redirects users even if we don't trust the click

## Behavior with `force_transparent=false`

When `force_transparent=false` (or omitted):
- **Blocked clicks:** Return HTTP 403 error (no redirect)
- **Empty bucket:** Return HTTP 503 error
- **Valid click:** Serve suffix from bucket

## Configuration Examples

### Example 1: Strict US-only with bot protection
```json
{
  "filtering": {
    "enabled": true,
    "bot_detection": true,
    "allowed_countries": ["US"],
    "rate_limit": {
      "enabled": true,
      "max_clicks_per_ip": 3,
      "window_minutes": 30
    }
  }
}
```

### Example 2: Block specific bad IPs and countries
```json
{
  "filtering": {
    "enabled": true,
    "bot_detection": true,
    "ip_blacklist": ["192.0.2.100", "198.51.100.50"],
    "blocked_countries": ["CN", "RU", "NG", "PK"]
  }
}
```

### Example 3: Minimal filtering (bots only)
```json
{
  "filtering": {
    "enabled": true,
    "bot_detection": true
  }
}
```

### Example 4: No filtering (not recommended)
```json
{
  "filtering": {
    "enabled": false
  }
}
```

## Monitoring Blocked Clicks

Query blocked clicks:
```sql
SELECT 
  clicked_at,
  user_ip,
  user_agent,
  target_country,
  block_reason
FROM google_ads_click_events
WHERE offer_name = 'YOUR_OFFER'
  AND blocked = true
ORDER BY clicked_at DESC
LIMIT 100;
```

Get blocking stats:
```sql
SELECT 
  block_reason,
  COUNT(*) as count,
  COUNT(DISTINCT user_ip) as unique_ips
FROM google_ads_click_events
WHERE offer_name = 'YOUR_OFFER'
  AND blocked = true
  AND clicked_at > NOW() - INTERVAL '7 days'
GROUP BY block_reason
ORDER BY count DESC;
```

## Update Configuration

Via SQL:
```sql
UPDATE offers
SET google_ads_config = jsonb_set(
  COALESCE(google_ads_config, '{}'::jsonb),
  '{filtering}',
  '{
    "enabled": true,
    "bot_detection": true,
    "allowed_countries": ["US", "GB", "CA"]
  }'::jsonb
)
WHERE offer_name = 'YOUR_OFFER';
```

## Best Practices

1. **Start permissive:** Begin with bot detection only, then add restrictions based on data
2. **Monitor first:** Review blocked click patterns before enabling strict filtering
3. **Use force_transparent:** Always set `force_transparent=true` in Google Ads URLs
4. **Rate limiting:** Start with generous limits (10-20 clicks/hour) and adjust down
5. **Country filtering:** Only use if you have specific geo-targeting needs
6. **Test thoroughly:** Test clicks from different locations/devices before going live

## Performance Impact

- Bot detection: ~1ms (regex matching)
- IP blacklist/whitelist: ~0.1ms (array lookup)
- Country checks: ~0.1ms (header read)
- Rate limiting: ~5-10ms (database query)

Total overhead: <15ms with all features enabled
