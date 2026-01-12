## Automatic Instance IP Whitelisting - Complete Solution

### Overview

This solution automatically whitelists new EC2 instance IPs in BrightData, ensuring that auto-scaling instances work without manual intervention.

### Architecture

```
EC2 Instance Startup (user-data)
  ↓
setup-brightdata-instance.sh
  ├─→ register-instance-ip.js (Register in DB)
  ├─→ auto-whitelist-brightdata.js (Immediate whitelist attempt)
  └─→ sync-brightdata-whitelist.js (Periodic retry, every 5 min)
  ↓
tracked_instance_ips table (Supabase)
  • instance_id
  • public_ip
  • whitelisted (TRUE/FALSE)
  • whitelist_error (if failed)
```

### Components

#### 1. Database Table: `tracked_instance_ips`
- **Location:** `supabase/migrations/20260112180000_track_instance_ips.sql`
- **Stores:** Instance ID, public IP, whitelist status, error messages
- **Indexes:** For fast queries on unwhitelisted IPs

#### 2. Registration Script
- **File:** `proxy-service/register-instance-ip.js`
- **When:** On instance startup
- **Does:** Registers instance ID and IP in database
- **Input:** AWS metadata service
- **Output:** Entry in `tracked_instance_ips` table

#### 3. Auto-Whitelist Script (Updated)
- **File:** `proxy-service/auto-whitelist-brightdata.js`
- **When:** On instance startup
- **Uses:** Both BrightData API endpoints:
  - `PUT /api/wip` (Proxy allowlist)
  - `PUT /api/add_whitelist_ip` (UI allowlist)
- **Reference:** https://docs.brightdata.com/api-reference/proxy-manager/allowlist-ips

#### 4. Periodic Sync Script
- **File:** `proxy-service/sync-brightdata-whitelist.js`
- **When:** Every 5 minutes via cron
- **Does:** Retries unwhitelisted IPs in batches
- **Prevents:** Rate limiting (max 10 IPs per run)

#### 5. Startup Orchestration
- **File:** `proxy-service/scripts/setup-brightdata-instance.sh`
- **When:** EC2 instance boot
- **Orchestrates:** All steps above
- **Handles:** Errors gracefully

### Deployment Steps

#### Step 1: Apply Database Migration
```bash
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"
supabase db push --include-all
```

Verify in Supabase dashboard:
```sql
SELECT * FROM tracked_instance_ips;
```

#### Step 2: Update EC2 Launch Template

Edit launch template and update **User-Data** script:

```bash
#!/bin/bash
set -e

# Install dependencies
cd /home/ubuntu
git pull origin main

# Navigate to proxy service
cd proxy-service

# Install Node modules
npm install

# Load environment
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Setup BrightData instance tracking
bash scripts/setup-brightdata-instance.sh

# Start services with PM2
pm2 start ecosystem.config.js --update-env
```

#### Step 3: Create Updated AMI

1. Launch instance from current template
2. Deploy code with updated user-data
3. Verify auto-whitelist runs: `cat /tmp/brightdata-sync.log`
4. Create AMI from updated instance
5. Update Launch Template to use new AMI

#### Step 4: Test Auto-Scaling

1. Manually launch new instance from updated Launch Template
2. Wait 30 seconds for startup scripts
3. Check database:
   ```sql
   SELECT instance_id, public_ip, whitelisted 
   FROM tracked_instance_ips 
   ORDER BY created_at DESC LIMIT 1;
   ```
4. Monitor sync logs:
   ```bash
   ssh ec2-user@instance
   tail -f /tmp/brightdata-sync.log
   ```

### Monitoring

#### Check Whitelist Status
```sql
-- All tracked instances
SELECT instance_id, public_ip, whitelisted, whitelist_error 
FROM tracked_instance_ips 
ORDER BY created_at DESC;

-- Only failed attempts
SELECT instance_id, public_ip, whitelist_error 
FROM tracked_instance_ips 
WHERE whitelisted = FALSE AND whitelist_error IS NOT NULL;

-- Recently created (last 1 hour)
SELECT instance_id, public_ip, whitelisted, created_at 
FROM tracked_instance_ips 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### View Sync Logs
On EC2 instance:
```bash
# Real-time
tail -f /tmp/brightdata-sync.log

# Last 50 lines
tail -50 /tmp/brightdata-sync.log

# With timestamps
grep "ERROR\|WARN" /tmp/brightdata-sync.log
```

### Workflow for New Instances

1. **Auto-Scaling launches new instance**
   - Instance boots with updated Launch Template

2. **User-Data runs on startup**
   - Runs `setup-brightdata-instance.sh`

3. **Step 1: Registration (1-2 sec)**
   - `register-instance-ip.js` gets instance ID and IP
   - Registers in `tracked_instance_ips` table with `whitelisted = FALSE`

4. **Step 2: Immediate Whitelist Attempt (2-3 sec)**
   - `auto-whitelist-brightdata.js` tries both API endpoints
   - If successful: marks `whitelisted = TRUE` in database
   - If failed: shows manual instructions, continues

5. **Step 3: Periodic Sync Started (background)**
   - `sync-brightdata-whitelist.js` runs every 5 minutes
   - Finds unwhitelisted IPs
   - Retries whitelist attempts
   - Updates database status

6. **Result: IP is whitelisted!** ✅
   - BrightData proxy works from new instance
   - No manual intervention needed

### Error Handling

#### Manual Fallback
If local API is unavailable (expected on EC2):
- Script logs clear instructions
- Database tracks: `whitelist_error = "Local API not available"`
- Periodic sync continues retrying
- User can whitelist manually via dashboard

#### Retry Logic
- Periodic sync retries every 5 minutes
- Processes failed IPs first
- Batch limits (10 max) prevent rate limiting
- Logs all attempts for debugging

### Files to Deploy

To EC2 instances, copy:
```
proxy-service/
  ├─ register-instance-ip.js
  ├─ sync-brightdata-whitelist.js
  └─ scripts/
     └─ setup-brightdata-instance.sh
```

Also update:
- `proxy-service/server.js` (from proxy-provider-routing)
- `proxy-service/trace-interactive.js` (from proxy-provider-routing)

### Verification Checklist

- [ ] Migration applied (`tracked_instance_ips` table exists)
- [ ] Files copied to EC2
- [ ] Launch template user-data updated
- [ ] New AMI created from updated instance
- [ ] Test instance launched from new AMI
- [ ] Instance auto-registered in database
- [ ] IP marked as whitelisted or shows error
- [ ] BrightData proxy routes work: `curl --proxy brd.superproxy.io:33335 ...`

### Future Enhancements

1. **Dashboard Widget**
   - Show whitelist status in UI
   - Manual override options

2. **Alerts**
   - Email/Slack on whitelisting failures
   - Track failed instances

3. **Batch Operations**
   - Bulk whitelist via dashboard
   - Bulk re-register instances

4. **API Key Rotation**
   - Automatic token refresh
   - Credential management

### Support

**If whitelisting fails:**
1. Check `/tmp/brightdata-sync.log` on instance
2. Verify `tracked_instance_ips` table has entry
3. Check `whitelist_error` column for error details
4. Manually whitelist via: https://brightdata.com/cp/zones
5. Verify: `curl --proxy brd.superproxy.io:33335 --proxy-user "..." "https://ipapi.co/json/"`
