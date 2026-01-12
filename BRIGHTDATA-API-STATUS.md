## BrightData API Whitelist Status

### Current Situation
- ✅ **Database Migration Applied**: `brightdata_admin_api_token`, `brightdata_customer_id`, `brightdata_zone_name` columns created
- ✅ **Settings Configured**: API token, customer ID, and zone name stored in Supabase
- ✅ **Auto-Whitelist Script Updated**: Now supports both local and cloud API approaches
- ⚠️ **Cloud API Issue**: Zone whitelist endpoints returning 404 (not available via cloud API)

### BrightData API Architecture

**BrightData has two API approaches:**

1. **Local API (Port 22999)** - Available when BrightData service runs locally
   - Endpoint: `PUT http://127.0.0.1:22999/api/whitelist_ip`
   - Header: `Authorization: API key`
   - Works on: Machines with local BrightData proxy service running
   - Does NOT work on: EC2 instances without local installation

2. **Cloud API** - For remote zone management
   - Status: Cloud API doesn't expose IP whitelisting endpoints
   - Alternative: Manual whitelisting via BrightData dashboard

### Solution Strategy

**For EC2 Instances:**
Since EC2 instances don't run local BrightData services, use manual whitelisting:

1. **Whitelist IPs via Dashboard:**
   - Go to https://brightdata.com/cp/zones
   - Select zone: `testing_softality_1`
   - Click "Zone Settings" → "IP Whitelist"
   - Add IPs:
     - Dev: `223.178.212.193`
     - EC2-1: `44.193.24.197`
     - EC2-2: `3.215.185.91`
     - EC2-3: `18.209.212.159`

2. **Auto-Whitelist Script Status:**
   - ✅ Script will detect when local API is available (port 22999)
   - ⚠️ Falls back gracefully if not available
   - 📋 Logs clear instructions for manual whitelisting

### Auto-Whitelist Script Behavior

```bash
node auto-whitelist-brightdata.js
```

The script will:
1. ✅ Detect instance IP (AWS metadata or ipify.org)
2. ✅ Try local API first (127.0.0.1:22999) - if running
3. ⏳ Try cloud API endpoints - if available
4. 📋 Exit with error if both fail - provides manual instructions

### Deployment Notes

- **EC2 Auto-Scaling:** Will work without auto-whitelist initially
- **Manual Step Required:** Whitelist IPs once via dashboard
- **Future Enhancement:** If BrightData adds cloud API for IP management, update script endpoint

### Testing Manual Whitelisting

Once you manually whitelist the IPs, test with:
```bash
# From EC2 instance
curl -i --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
  "https://ipapi.co/json/"
```

Should return: `HTTP/1.1 200 OK` (not 407)
