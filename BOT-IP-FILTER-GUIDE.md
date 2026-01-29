# Bot & IP Filter System - Complete Guide

## Overview

The Google Ads click handler has a **9-point filtering system** that can block suspicious traffic. All filters are **OPT-IN** (disabled by default) - nothing is blocked unless you explicitly enable it.

---

## Configuration Structure

Filters are stored in the database under:
```javascript
google_ads_config.filtering = {
  enabled: true/false,                    // Master switch - ALL filters require this=true
  bot_detection: true/false,              // Filter 1
  ip_blacklist: [],                       // Filter 2
  ip_whitelist: [],                       // Filter 3
  blocked_countries: [],                  // Filter 4
  allowed_countries: [],                  // Filter 5
  rate_limit: { enabled, max_clicks_per_ip, window_minutes }, // Filter 6
  block_datacenters: true/false,          // Filter 7
  block_vpn_proxy: true/false,            // Filter 8
  block_repeat_ips: true/false,           // Filter 9
  repeat_ip_window_days: 7                // Days to check for repeat IPs
}
```

---

## Master Enable Switch

### `enabled: true/false`

**Default**: `false` (all filtering disabled)

If `enabled !== true`, **ALL filters are skipped** regardless of individual settings.

```javascript
if (config.enabled !== true) { 
  return { blocked: false, reason: null };  // Skip everything
}
```

**Frontend Checkbox**: Master toggle to enable/disable filtering system

---

## Filter #1: Bot Detection

### `bot_detection: true/false`

**Default**: `false` (not blocking bots)

**What it blocks:**
- User-Agents matching known bot patterns (900+ patterns from `isbot` library)
- Missing or invalid User-Agent (< 10 characters)
- Specific keywords: `bot`, `crawl`, `spider`, `scrape`, `curl`, `wget`, `python`, `java`, `okhttp`, `axios`, `fetch`, `selenium`, `puppeteer`, `headless`, `phantom`, etc.

**Frontend Checkbox**: "Block Bots"

**Example Blocks:**
- `Mozilla/5.0 (compatible; Googlebot/2.1)`
- `curl/7.68.0`
- `python-requests/2.28.0`
- Empty User-Agent

---

## Filter #2: IP Blacklist

### `ip_blacklist: []`

**Default**: `[]` (empty, nothing blocked)

**What it does:**
- If IP appears in the array, block the click
- **Requires manual configuration** - enter specific IPs to block

**Frontend**: Text field or list input for IPs to block

**Example Configuration:**
```json
{
  "ip_blacklist": [
    "192.168.1.1",
    "10.0.0.50",
    "203.45.67.89"
  ]
}
```

**Result**: Clicks from these IPs will be blocked

---

## Filter #3: IP Whitelist

### `ip_whitelist: []`

**Default**: `[]` (empty, all IPs allowed)

**What it does:**
- If whitelist is **NOT empty**, ONLY allow IPs in the list
- If IP is NOT in the whitelist, block the click
- **Most restrictive filter** - if enabled, ONLY whitelisted IPs get through

**Frontend**: Text field for IPs that are ALLOWED

**Example Configuration:**
```json
{
  "ip_whitelist": [
    "192.168.1.100",
    "192.168.1.101",
    "192.168.1.102"
  ]
}
```

**Result**: Only these 3 IPs can click through. Everyone else is blocked.

---

## Filter #4: Geo Blocking (Blocked Countries)

### `blocked_countries: []`

**Default**: `[]` (no countries blocked)

**What it does:**
- If country is in the list, block the click
- Uses 2-letter country code (US, UK, DE, CN, etc.)

**Frontend**: Dropdown or checklist of countries to block

**Example Configuration:**
```json
{
  "blocked_countries": ["CN", "RU", "KP"]
}
```

**Result**: Clicks from China, Russia, and North Korea will be blocked

---

## Filter #5: Geo Whitelist (Allowed Countries)

### `allowed_countries: []`

**Default**: `[]` (all countries allowed)

**What it does:**
- If whitelist is **NOT empty**, ONLY allow clicks from these countries
- If country is NOT in the whitelist, block the click
- **Restricts to specific regions only**

**Frontend**: Dropdown or checklist of countries to ALLOW

**Example Configuration:**
```json
{
  "allowed_countries": ["US", "CA", "UK", "AU"]
}
```

**Result**: Only clicks from USA, Canada, UK, and Australia pass through. All others blocked.

---

## Filter #6: Rate Limiting

### `rate_limit: { enabled, max_clicks_per_ip, window_minutes }`

**Default**: Not configured (no rate limiting)

**What it does:**
- Blocks an IP if it exceeds max clicks within a time window
- Queries database to count recent clicks from the IP

**Frontend Configuration**:
- Toggle to enable
- Input field: Max clicks per IP (e.g., `10`)
- Input field: Time window in minutes (e.g., `60`)

**Example Configuration:**
```json
{
  "rate_limit": {
    "enabled": true,
    "max_clicks_per_ip": 10,
    "window_minutes": 60
  }
}
```

**Result**: If the same IP clicks more than 10 times in 60 minutes, subsequent clicks are blocked

**Use Case**: Prevent automated click farms or fraud clicks

---

## Filter #7: Datacenter Detection

### `block_datacenters: true/false`

**Default**: `false` (datacenter IPs allowed)

**What it does:**
- Queries GeoIP service to detect if IP is from a datacenter
- Checks if IP belongs to AWS, Azure, Google Cloud, DigitalOcean, etc.
- Returns ASN (Autonomous System Number) to identify provider

**Frontend Checkbox**: "Block Datacenter IPs"

**Example Blocks:**
- AWS EC2 instances
- Google Cloud Platform IPs
- Linode, DigitalOcean, Vultr servers
- Azure VMs

**Reason String**: `"Datacenter IP detected: AS16509 (Amazon Web Services)"`

---

## Filter #8: VPN/Proxy Detection

### `block_vpn_proxy: true/false`

**Default**: `false` (VPN/proxy IPs allowed)

**What it does:**
- Queries GeoIP service for ISP organization name
- Checks if ISP matches known VPN/proxy providers

**Frontend Checkbox**: "Block VPN/Proxy"

**Detected Providers**:
- ExpressVPN, NordVPN, Surfshark, CyberGhost
- Tor exit nodes
- Anonymous proxy services
- I2P networks
- Bitdefender, Zenmate, Browsec, Hotspot Shield
- Cloudflare WARP (1.1.1.1)
- PIA VPN

**Reason String**: `"VPN/Proxy provider detected: NordVPN"`

---

## Filter #9: Repeat IP Detection

### `block_repeat_ips: true/false` + `repeat_ip_window_days: N`

**Default**: `false` (repeat IPs allowed)

**What it does:**
- Checks if the same IP clicked within the last N days
- Only counts **successful clicks** (blocked=false AND suffix!=null)
- Prevents the same user from getting multiple suffixes

**Frontend Configuration**:
- Toggle: "Block Repeat IPs"
- Input field: Number of days to check (e.g., `7` days)

**Example Configuration:**
```json
{
  "block_repeat_ips": true,
  "repeat_ip_window_days": 7
}
```

**Result**: 
- User clicks on Day 1 → Gets suffix, logged to database
- User clicks on Day 3 from same IP → Blocked (within 7-day window)
- User clicks on Day 10 from same IP → Allowed (outside 7-day window)

**Reason String**: `"Repeat IP: last click 3 days ago (within 7-day window)"`

---

## Flow Diagram

```
Click Request
    ↓
Is filtering enabled (enabled === true)?
    ├─ NO → Allow click, skip all filters
    └─ YES → Check each filter:
        ├─ Bot Detection? → BLOCK if bot
        ├─ IP Blacklist? → BLOCK if in blacklist
        ├─ IP Whitelist? → BLOCK if NOT in whitelist
        ├─ Blocked Countries? → BLOCK if in list
        ├─ Allowed Countries? → BLOCK if NOT in list
        ├─ Rate Limit? → BLOCK if exceeds limit
        ├─ Datacenter? → BLOCK if datacenter IP
        ├─ VPN/Proxy? → BLOCK if VPN/proxy detected
        └─ Repeat IP? → BLOCK if clicked recently
    ↓
All checks passed? 
    ├─ NO → Return { blocked: true, reason: "..." }
    └─ YES → Return { blocked: false, reason: null }
    ↓
If blocked:
    └─ Log click with blocked=true, log reason
If not blocked:
    └─ Get suffix from bucket, append to URL, redirect
```

---

## Common Configurations

### Configuration 1: Allow Only US Traffic
```json
{
  "enabled": true,
  "allowed_countries": ["US"],
  "block_bots": true,
  "block_datacenters": true
}
```
**Result**: Only real US users (not bots, not datacenters) can proceed

### Configuration 2: Block Known Fraud IPs
```json
{
  "enabled": true,
  "ip_blacklist": ["192.168.1.1", "10.0.0.50"]
}
```
**Result**: Only these 2 IPs are blocked, everything else allowed

### Configuration 3: Prevent Click Spam
```json
{
  "enabled": true,
  "rate_limit": {
    "enabled": true,
    "max_clicks_per_ip": 5,
    "window_minutes": 30
  },
  "block_repeat_ips": true,
  "repeat_ip_window_days": 30
}
```
**Result**: Max 5 clicks per IP per 30 minutes, and can only get one suffix per 30 days

### Configuration 4: Premium Traffic (High Quality)
```json
{
  "enabled": true,
  "bot_detection": true,
  "block_datacenters": true,
  "block_vpn_proxy": true,
  "allowed_countries": ["US", "CA", "UK", "DE", "FR"],
  "rate_limit": {
    "enabled": true,
    "max_clicks_per_ip": 3,
    "window_minutes": 60
  },
  "block_repeat_ips": true,
  "repeat_ip_window_days": 60
}
```
**Result**: 
- No bots, no datacenters, no VPNs
- Only from specific countries
- Max 3 clicks per hour per IP
- Only one suffix per 60 days per IP
- **Very restrictive = highest quality traffic**

---

## How to Configure in Frontend

1. **Enable/Disable Filtering**: Toggle "Enable Filtering" checkbox
2. **For each filter**:
   - If it's a `true/false` filter → Show toggle checkbox
   - If it's a list (IPs, countries) → Show text input or dropdown
   - If it's rate limiting → Show form with multiple inputs

3. **Save to Database**: Store in `google_ads_config.filtering` table

4. **Click Handler Reads Config**: On each `/click` request, fetches fresh config and applies filters

---

## Database Storage

```sql
-- Table: google_ads_config
{
  id: UUID,
  user_id: UUID,
  offer_id: UUID,
  filtering: JSONB,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}

-- Example filtering JSONB:
{
  "enabled": true,
  "bot_detection": true,
  "ip_blacklist": [],
  "ip_whitelist": [],
  "blocked_countries": ["CN", "RU"],
  "allowed_countries": [],
  "rate_limit": {
    "enabled": true,
    "max_clicks_per_ip": 10,
    "window_minutes": 60
  },
  "block_datacenters": true,
  "block_vpn_proxy": false,
  "block_repeat_ips": true,
  "repeat_ip_window_days": 7
}
```

---

## Testing Filters

### Test Bot Detection:
```bash
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1)" \
  "https://ads.day24.online/click?offer_name=TEST&url=https://example.com"
```
Result (if bot_detection=true): `{"blocked": true, "reason": "Bot detected by isbot library"}`

### Test Blacklisted IP:
```bash
# Assuming 192.168.1.1 is blacklisted
curl -H "X-Forwarded-For: 192.168.1.1" \
  "https://ads.day24.online/click?offer_name=TEST&url=https://example.com"
```
Result (if configured): `{"blocked": true, "reason": "IP blacklisted"}`

### Test Rate Limiting:
```bash
# Make 11 requests from same IP in 1 hour (max=10)
for i in {1..11}; do
  curl "https://ads.day24.online/click?offer_name=TEST&url=https://example.com"
done
```
Result (on 11th request): `{"blocked": true, "reason": "Rate limit exceeded: 11/10 in 60m"}`

---

## Current Status

✅ All 9 filters implemented and working
✅ Filters are opt-in (disabled by default)
✅ Database storage ready for configuration
✅ Frontend can control all filters
✅ Click logging includes block reason
