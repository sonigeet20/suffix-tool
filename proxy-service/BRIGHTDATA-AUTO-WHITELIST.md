# BrightData IP Auto-Whitelist

## Overview

Automatically whitelist new EC2 instance IPs in BrightData to prevent 407 authentication errors.

## Problem

BrightData requires IP whitelisting for proxy authentication. When new EC2 instances launch (auto-scaling, replacements, etc.), their IPs are not whitelisted, causing 407 errors.

## Solution

Automatic IP whitelisting on instance startup using BrightData API.

## Setup

### 1. Add BrightData API Configuration to Database

Run the migration:
```bash
psql -d your_database -f supabase/migrations/20260112000000_add_brightdata_api_config.sql
```

Or via Supabase dashboard:
```sql
UPDATE settings SET
  brightdata_admin_api_token = 'a32a1380-c9f6-4d4c-85fe-b137b0116783',
  brightdata_customer_id = 'hl_a908b07a',
  brightdata_zone_name = 'testing_softality_1'
WHERE id = 1;
```

### 2. Get BrightData API Token

1. Go to https://brightdata.com/cp/api_tokens
2. Create a new API token with "Zones" permissions
3. Copy the token and save it to the database

### 3. Configure Auto-Start on EC2 Instances

#### Option A: PM2 Ecosystem File (Recommended)

Add to `ecosystem.config.js`:
```javascript
{
  name: 'brightdata-whitelist',
  script: 'auto-whitelist-brightdata.js',
  cwd: '/home/ubuntu/proxy-service',
  instances: 1,
  autorestart: false,  // Run once on startup
  max_restarts: 3,
  restart_delay: 5000,
  env: {
    NODE_ENV: 'production',
  },
}
```

Then: `pm2 restart ecosystem.config.js --update-env`

#### Option B: Systemd Service

Create `/etc/systemd/system/brightdata-whitelist.service`:
```ini
[Unit]
Description=BrightData IP Auto-Whitelist
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/proxy-service
ExecStart=/usr/bin/node /home/ubuntu/proxy-service/auto-whitelist-brightdata.js
StandardOutput=journal
StandardError=journal
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable brightdata-whitelist.service
sudo systemctl start brightdata-whitelist.service
```

#### Option C: User Data Script

Add to EC2 instance launch configuration:
```bash
#!/bin/bash
cd /home/ubuntu/proxy-service
/usr/bin/node auto-whitelist-brightdata.js >> /var/log/brightdata-whitelist.log 2>&1
```

## Manual Testing

```bash
# Test the whitelist script
cd proxy-service
node auto-whitelist-brightdata.js

# Expected output:
# ═══════════════════════════════════════════════
# 🔐 BrightData IP Auto-Whitelist
# ═══════════════════════════════════════════════
# 
# [INFO] Step 1: Detecting current public IP...
# [INFO] ✅ Got IP from AWS metadata: 44.193.24.197
# 
# 📍 Current Public IP: 44.193.24.197
# 
# [INFO] Step 2: Loading BrightData credentials from database...
# 
# 🔧 BrightData Configuration:
#    Customer ID: hl_a908b07a
#    Zone Name: testing_softality_1
# 
# [INFO] Step 3: Checking current whitelist...
# [INFO] Step 4: Adding 44.193.24.197 to whitelist...
# [INFO] ✅ Successfully added IP to whitelist
# 
# ✅ SUCCESS!
#    IP 44.193.24.197 has been whitelisted in BrightData zone testing_softality_1
```

## BrightData API Reference

### Get Whitelist
```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  "https://brightdata.com/api/zone/whitelist_ips?customer=hl_a908b07a&zone=testing_softality_1"
```

### Add IP to Whitelist
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip": "44.193.24.197"}' \
  "https://brightdata.com/api/zone/whitelist_ip?customer=hl_a908b07a&zone=testing_softality_1"
```

## Deployment Checklist

- [ ] Run database migration to add brightdata_* columns
- [ ] Add BrightData API token to settings table
- [ ] Add customer ID and zone name to settings table
- [ ] Copy `auto-whitelist-brightdata.js` to all EC2 instances
- [ ] Configure auto-start (PM2 ecosystem or systemd)
- [ ] Test on one instance first
- [ ] Update Launch Template user-data to include whitelist script
- [ ] Update AMI with auto-whitelist script included

## Troubleshooting

**Error: "Failed to detect public IP"**
- Check network connectivity
- Ensure instance has public IP assigned
- Verify security groups allow outbound HTTPS

**Error: "BrightData API token not found"**
- Run database migration
- Update settings table with API token
- Verify environment variables are loaded

**Error: "Failed to add IP to whitelist"**
- Check API token permissions
- Verify customer ID and zone name are correct
- Check BrightData API status

## Logs

- Script output: `pm2 logs brightdata-whitelist`
- Systemd: `journalctl -u brightdata-whitelist.service`
- User data: `/var/log/cloud-init-output.log`

## Benefits

✅ **Zero manual intervention** - New instances auto-configure
✅ **No 407 errors** - IPs whitelisted before first trace
✅ **Auto-scaling ready** - Works with ASG launches
✅ **Fail-safe** - Service starts even if whitelist fails
✅ **Idempotent** - Safe to run multiple times
