# Quick Start: Automatic Instance IP Whitelisting

## 3-Step Deployment

### 1️⃣ Apply Database Migration
```bash
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"
supabase db push --include-all
```

### 2️⃣ Update EC2 Launch Template User-Data
Replace or update the user-data script with:

```bash
#!/bin/bash
set -e
cd /home/ubuntu/proxy-service
bash scripts/setup-brightdata-instance.sh
pm2 start ecosystem.config.js --update-env
```

### 3️⃣ Test with New Instance
```bash
# Launch new instance from template
# Wait 30 seconds, then check:

# Via SSH
ssh ec2-user@new-instance
tail -f /tmp/brightdata-sync.log

# Via database
psql $DATABASE_URL -c "SELECT instance_id, public_ip, whitelisted FROM tracked_instance_ips ORDER BY created_at DESC LIMIT 1;"
```

## How It Works

**New instance starts:**
1. Auto-registers IP in database
2. Attempts local API whitelist
3. Starts periodic sync (every 5 min)

**Result:** IP whitelisted automatically ✅

## Files Included

- `supabase/migrations/20260112180000_track_instance_ips.sql` - Database schema
- `proxy-service/register-instance-ip.js` - Register instance
- `proxy-service/auto-whitelist-brightdata.js` - Whitelist via API
- `proxy-service/sync-brightdata-whitelist.js` - Periodic retry
- `proxy-service/scripts/setup-brightdata-instance.sh` - Startup script

## Monitor Status

```sql
-- Check all instances
SELECT instance_id, public_ip, whitelisted, whitelist_error 
FROM tracked_instance_ips 
ORDER BY created_at DESC;

-- Check failed attempts
SELECT instance_id, public_ip, whitelist_error 
FROM tracked_instance_ips 
WHERE whitelisted = FALSE AND whitelist_error IS NOT NULL;
```

## Troubleshooting

**IP not whitelisting?**
1. SSH to instance: `tail -f /tmp/brightdata-sync.log`
2. Check database: `SELECT * FROM tracked_instance_ips WHERE instance_id = '...';`
3. Manual whitelist: https://brightdata.com/cp/zones → testing_softality_1 → IP Whitelist
4. Verify: `curl --proxy brd.superproxy.io:33335 --proxy-user "..." "https://ipapi.co/json/"`

## What's Automatic

✅ IP detection (AWS metadata)
✅ Instance registration (Supabase)
✅ Whitelist attempts (local API)
✅ Periodic retries (every 5 min)
✅ Error tracking (database)

## What Needs Manual Help

❌ Initial BrightData zone setup
❌ If local API unavailable (EC2 doesn't have local service)
❌ API token generation (one-time)

---

**Full documentation:** See `AUTOMATIC-INSTANCE-IP-WHITELISTING.md`
