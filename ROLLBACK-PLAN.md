# ROLLBACK PLAN - Bright Data user_context Fix

**Created:** January 14, 2026  
**Purpose:** Emergency rollback procedures for Bright Data user_context deployment

---

## 🔴 EMERGENCY ROLLBACK PROCEDURES

### Quick Rollback Command Summary
```bash
# If you need to rollback IMMEDIATELY, run these commands:

# 1. Rollback Supabase Edge Function (takes ~30 seconds)
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
git checkout HEAD~1 supabase/functions/trace-redirects/index.ts
supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn --no-verify-jwt

# 2. Rollback AWS EC2 Instance (takes ~1 minute per instance)
ssh -i suffix-server.pem ec2-user@44.193.24.197
cd suffix-tool
git pull origin main  # If you pushed a revert commit
# OR
git reset --hard HEAD~1  # If reverting locally
pm2 restart proxy-service
pm2 logs proxy-service --lines 50
```

---

## 📋 PRE-DEPLOYMENT BACKUP

### Step 1: Backup Current Working Files

**Backup Supabase Edge Function:**
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
mkdir -p .backup/$(date +%Y%m%d_%H%M%S)
cp supabase/functions/trace-redirects/index.ts .backup/$(date +%Y%m%d_%H%M%S)/index.ts.backup

# Verify backup
ls -la .backup/$(date +%Y%m%d_%H%M%S)/
```

**Backup Proxy Service Files:**
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
cp proxy-service/server.js .backup/$(date +%Y%m%d_%H%M%S)/server.js.backup

# Create a backup of the current working directory (no proxy-providers-handler.js yet)
tar -czf .backup/$(date +%Y%m%d_%H%M%S)/proxy-service-backup.tar.gz \
  proxy-service/server.js \
  proxy-service/package.json \
  proxy-service/trace-interactive.js

# Verify backup
tar -tzf .backup/$(date +%Y%m%d_%H%M%S)/proxy-service-backup.tar.gz
```

### Step 2: Tag Current Git Commit

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Tag the current stable version
git tag -a v1.0-before-brightdata-fix -m "Stable version before Bright Data user_context fix"

# View the tag
git tag -l -n1

# Push tag to remote (optional but recommended)
git push origin v1.0-before-brightdata-fix
```

### Step 3: Document Current Supabase Edge Function Version

```bash
# Get the current deployed version info
supabase functions list --project-id rfhuqenntxiqurplenjn

# Save the output
supabase functions list --project-id rfhuqenntxiqurplenjn > .backup/$(date +%Y%m%d_%H%M%S)/supabase-functions-before.txt
```

---

## 🔄 SUPABASE EDGE FUNCTION ROLLBACK

### Method 1: Rollback from Git (Recommended)

**If deployment fails during testing:**
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Checkout the previous working version
git checkout v1.0-before-brightdata-fix -- supabase/functions/trace-redirects/index.ts

# Redeploy the old version
supabase functions deploy trace-redirects \
  --project-id rfhuqenntxiqurplenjn \
  --no-verify-jwt

# Verify deployment
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}'

# If successful, restore the file in git
git checkout HEAD -- supabase/functions/trace-redirects/index.ts
```

### Method 2: Rollback from Backup

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Find the latest backup
BACKUP_DIR=$(ls -td .backup/*/ | head -1)
echo "Using backup from: $BACKUP_DIR"

# Restore the backup
cp ${BACKUP_DIR}/index.ts.backup supabase/functions/trace-redirects/index.ts

# Redeploy
supabase functions deploy trace-redirects \
  --project-id rfhuqenntxiqurplenjn \
  --no-verify-jwt

# Verify
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http"}'
```

### Method 3: Emergency Git Revert

**If new version is already committed:**
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Create a revert commit (safer than reset)
git revert HEAD --no-edit

# Push the revert
git push origin main

# Redeploy from reverted state
supabase functions deploy trace-redirects \
  --project-id rfhuqenntxiqurplenjn \
  --no-verify-jwt
```

**Expected Result After Rollback:**
- Edge function returns to previous working state
- Bright Data Browser API will show old error messages (if any)
- All other trace modes continue working normally

**Verification Command:**
```bash
# Test that it works
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"http","max_redirects":5}' | jq .

# Should return successful trace result
```

---

## 🔄 AWS EC2 ROLLBACK

### Method 1: Rollback Single Instance (Quick Test)

**Instance 1: 44.193.24.197 (Test Instance)**

```bash
# Connect to instance
ssh -i suffix-server.pem ec2-user@44.193.24.197

# Navigate to project
cd suffix-tool

# Check current git status
git log --oneline -5
git status

# Option A: If new commit was pushed, pull and checkout previous version
git fetch origin
git checkout HEAD~1
pm2 restart proxy-service

# Option B: If using git revert
git pull origin main  # This will pull the revert commit
pm2 restart proxy-service

# Option C: Restore from backup (if available)
cd /home/ec2-user
tar -xzf suffix-tool-backup.tar.gz -C suffix-tool/
cd suffix-tool
pm2 restart proxy-service

# Verify rollback
pm2 logs proxy-service --lines 50 | grep -i "proxy\|error"

# Test the service
curl http://localhost:3000/health

# If health check passes, test a trace
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}'

# Exit
exit
```

### Method 2: Rollback All Instances (If Needed)

**Create a rollback script for all instances:**

```bash
# On your local machine
cat > /tmp/rollback-all-instances.sh << 'EOF'
#!/bin/bash

INSTANCES=(
  "44.193.24.197"
  "3.215.185.91"
  "18.209.212.159"
)

KEY_PATH="suffix-server.pem"

for instance in "${INSTANCES[@]}"; do
  echo "======================================"
  echo "Rolling back instance: $instance"
  echo "======================================"
  
  ssh -i $KEY_PATH ec2-user@$instance << 'ENDSSH'
    cd suffix-tool
    git checkout HEAD~1
    pm2 restart proxy-service
    sleep 3
    pm2 logs proxy-service --lines 20 | grep -i "proxy\|error"
    curl -s http://localhost:3000/health | jq .status
ENDSSH
  
  echo ""
  echo "Rollback completed for $instance"
  echo ""
  sleep 2
done

echo "======================================"
echo "All instances rolled back"
echo "======================================"
EOF

chmod +x /tmp/rollback-all-instances.sh
```

**Execute rollback on all instances:**
```bash
/tmp/rollback-all-instances.sh
```

### Method 3: Emergency Service Stop

**If service is causing issues and needs immediate shutdown:**

```bash
# Connect to problematic instance
ssh -i suffix-server.pem ec2-user@44.193.24.197

# Stop the service immediately
pm2 stop proxy-service

# Check status
pm2 status

# If needed, kill all node processes
pm2 kill

# Rollback code
cd suffix-tool
git checkout HEAD~1

# Restart with old code
pm2 start proxy-service

# Monitor
pm2 logs proxy-service --lines 50
```

---

## 🧪 ROLLBACK VERIFICATION CHECKLIST

After performing any rollback, verify:

### Supabase Edge Function:
- [ ] Function deploys successfully
- [ ] HTTP mode works: `curl -X POST .../trace-redirects -d '{"url":"...","mode":"http"}'`
- [ ] No new errors in function logs
- [ ] Response format unchanged
- [ ] Existing integrations still work

### AWS EC2 Instances:
- [ ] PM2 shows service running: `pm2 status`
- [ ] Health check passes: `curl http://localhost:3000/health`
- [ ] HTTP trace works: Test with curl
- [ ] Browser trace works: Test with curl
- [ ] No errors in logs: `pm2 logs proxy-service --lines 100 | grep ERROR`
- [ ] Proxy settings loaded: Check logs for "Proxy settings loaded"

### Overall System:
- [ ] Trackier integration still works
- [ ] Existing offers continue tracing
- [ ] No increase in error rate
- [ ] Response times normal
- [ ] No customer complaints

---

## 📊 ROLLBACK DECISION CRITERIA

**When to rollback:**

🔴 **Immediate Rollback Required:**
- Edge function returns 500 errors consistently
- PM2 service crashes repeatedly
- Critical trace modes broken (http, browser)
- Error rate increases by >50%
- Proxy connections fail completely
- Database queries timing out

🟡 **Consider Rollback:**
- Error rate increases by 10-50%
- Some trace modes slower than before
- Intermittent failures (>5% of requests)
- Customer reports issues
- Bright Data API returns new errors

🟢 **No Rollback Needed:**
- Minor log message changes
- Performance within 10% of baseline
- Error rate stable
- All trace modes working
- Positive test results

---

## 🛠️ TROUBLESHOOTING DURING ROLLBACK

### Issue: Git checkout fails
```bash
# Force checkout, discarding local changes
git reset --hard HEAD~1

# Or restore from backup
cp .backup/*/server.js.backup proxy-service/server.js
```

### Issue: PM2 restart fails
```bash
# Kill PM2 completely and restart
pm2 kill
pm2 start proxy-service/server.js --name proxy-service

# Or start manually
cd proxy-service
node server.js  # Run in foreground to see errors
```

### Issue: Supabase deploy fails
```bash
# Check auth
supabase auth status

# Re-login if needed
supabase login

# Try deploy again with verbose output
supabase functions deploy trace-redirects \
  --project-id rfhuqenntxiqurplenjn \
  --no-verify-jwt \
  --debug
```

### Issue: Cannot access EC2 instance
```bash
# Check instance status in AWS console
# Try from a different network
# Check security group rules
# Verify SSH key permissions: chmod 400 suffix-server.pem
```

---

## 📞 EMERGENCY CONTACTS & RESOURCES

**Supabase Dashboard:**
- URL: https://app.supabase.com/project/rfhuqenntxiqurplenjn
- Functions: https://app.supabase.com/project/rfhuqenntxiqurplenjn/functions

**AWS Console:**
- EC2 Instances: https://console.aws.amazon.com/ec2/
- Region: us-east-1

**Documentation:**
- Backup location: `.backup/` directory
- Git tag: `v1.0-before-brightdata-fix`
- Deployment checklist: `DEPLOYMENT-CHECKLIST.txt`
- Test report: `PROXY-PROVIDERS-TEST-REPORT.txt`

---

## ⏱️ ROLLBACK TIME ESTIMATES

| Component | Rollback Time | Downtime |
|-----------|---------------|----------|
| Supabase Edge Function | 2-3 minutes | ~30 seconds |
| Single EC2 Instance | 3-5 minutes | ~10 seconds |
| All EC2 Instances | 10-15 minutes | ~10 seconds each |
| Full System Rollback | 15-20 minutes | ~2 minutes total |

**Note:** Downtime is minimal because:
- Multiple EC2 instances provide redundancy
- PM2 restarts are fast (~5-10 seconds)
- Edge function rollback is atomic
- Old code is backward compatible

---

## ✅ POST-ROLLBACK ACTIONS

After successful rollback:

1. **Document the issue:**
   ```bash
   echo "Rollback performed on $(date)" >> rollback-log.txt
   echo "Reason: [describe issue]" >> rollback-log.txt
   echo "Components rolled back: [list]" >> rollback-log.txt
   ```

2. **Notify team:**
   - Send notification to relevant team members
   - Update status page if applicable
   - Document in incident log

3. **Analyze root cause:**
   - Review logs from failed deployment
   - Identify what went wrong
   - Plan fix before re-attempting

4. **Keep monitoring:**
   - Monitor error rates for 30 minutes post-rollback
   - Check that all services stabilize
   - Verify customer-facing features work

5. **Plan next steps:**
   - Fix identified issues
   - Test more thoroughly in staging
   - Schedule new deployment window

---

## 🎯 ROLLBACK SUCCESS CRITERIA

Rollback is considered successful when:

- ✅ All EC2 instances running and healthy
- ✅ Health checks passing on all instances
- ✅ Edge function responding normally
- ✅ Error rate returns to baseline
- ✅ No new errors in logs
- ✅ All trace modes functional
- ✅ Trackier integration working
- ✅ Response times normal
- ✅ No customer complaints
- ✅ System stable for 30+ minutes

---

**Last Updated:** January 14, 2026  
**Next Review:** After deployment completion
