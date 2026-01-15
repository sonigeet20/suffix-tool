# INCREMENTAL DEPLOYMENT PLAN - Bright Data user_context Fix

**Created:** January 14, 2026  
**Strategy:** Test on 1 instance first, then roll out to remaining instances

---

## 🎯 DEPLOYMENT STRATEGY

**Phase 1:** Backup & Preparation (5 minutes)  
**Phase 2:** Supabase Edge Function Deployment (5 minutes)  
**Phase 3:** Single EC2 Instance Test (20 minutes)  
**Phase 4:** Remaining EC2 Instances (15 minutes)  
**Phase 5:** Monitoring & Validation (30 minutes)

**Total Time:** ~75 minutes  
**Rollback Ready:** At every phase

---

## 📋 PHASE 1: BACKUP & PREPARATION

### Step 1.1: Create Backups

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Create backup directory with timestamp
BACKUP_DIR=".backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup critical files
cp supabase/functions/trace-redirects/index.ts $BACKUP_DIR/index.ts.backup
cp proxy-service/server.js $BACKUP_DIR/server.js.backup

# Create tarball of entire proxy-service
tar -czf $BACKUP_DIR/proxy-service-backup.tar.gz \
  proxy-service/server.js \
  proxy-service/package.json \
  proxy-service/trace-interactive.js \
  proxy-service/lib/*.js 2>/dev/null || true

# Verify backups
ls -lh $BACKUP_DIR/
echo "✅ Backups created in: $BACKUP_DIR"
```

### Step 1.2: Tag Git Commit

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Tag current stable version
git tag -a v1.0-pre-deployment -m "Version before Bright Data user_context deployment - $(date +%Y-%m-%d)"

# View tag
git show v1.0-pre-deployment --no-patch

# Push tag to remote
git push origin v1.0-pre-deployment

echo "✅ Git tag created: v1.0-pre-deployment"
```

### Step 1.3: Commit and Push Changes

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Review changes
git status
git diff proxy-service/server.js | head -50
git diff supabase/functions/trace-redirects/index.ts | head -50

# Stage all changes
git add proxy-service/lib/proxy-providers-handler.js
git add proxy-service/server.js
git add supabase/functions/trace-redirects/index.ts
git add DEPLOYMENT-CHECKLIST.txt
git add ROLLBACK-PLAN.md
git add INCREMENTAL-DEPLOYMENT.md

# Commit with detailed message
git commit -m "fix: Add user_context to Bright Data Browser API + proxy provider selection

- Added user_context parameter to fix 'requires user context' error in Bright Data Browser API
- Created proxy-providers-handler.js for centralized provider management
- Support for offer.provider_id override from proxy_providers table
- Fallback to Luna proxy from settings table if no provider found
- All changes backward compatible (additive only)
- Comprehensive rollback plan included
- Tested locally: all trace modes working (http, browser, anti_cloaking)
- Proxy connections verified: Luna proxy working with geo-targeting

Files modified:
- NEW: proxy-service/lib/proxy-providers-handler.js (348 lines)
- MODIFIED: proxy-service/server.js (user_context in traceRedirectsBrightDataBrowser)
- MODIFIED: supabase/functions/trace-redirects/index.ts (user_context in 3 locations)

Test results:
- Luna proxy: Working (IPs: 37.212.54.150, 45.49.35.155)
- Bright Data fix: Verified (error changed from 'requires user context' to 'provider not found')
- All trace modes: Passing
- Geo-targeting: Working (US IP confirmed)

Deployment: Incremental (1 instance first)
Rollback: Plan documented in ROLLBACK-PLAN.md"

# Push to remote
git push origin main

echo "✅ Changes committed and pushed"
```

**⏸️ CHECKPOINT 1: Backups and git ready**
- [ ] Backups created
- [ ] Git tag created
- [ ] Changes committed and pushed
- [ ] Ready to proceed to Supabase deployment

---

## 📋 PHASE 2: SUPABASE EDGE FUNCTION DEPLOYMENT

### Step 2.1: Deploy Edge Function

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Deploy with --no-verify-jwt flag to keep publicly accessible
supabase functions deploy trace-redirects \
  --project-id rfhuqenntxiqurplenjn \
  --no-verify-jwt

# Expected output:
# ✓ Deploying function trace-redirects
# ✓ Function deployed successfully
```

### Step 2.2: Verify Edge Function Deployment

```bash
# Test 1: Basic HTTP trace (should work)
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' \
  | jq '.success, .final_url, .total_steps'

# Expected: success=true, final_url shows the URL, total_steps >= 1

# Test 2: Bright Data Browser API (should show new error message)
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://httpbin.org/ip",
    "mode":"brightdata_browser",
    "user_id":"f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b",
    "offer_id":"test_offer"
  }' | jq '.error, .details'

# Expected: error about "No enabled Bright Data Browser provider found"
# This confirms user_context is being sent (no longer "requires user context" error)

# Test 3: Check function logs
supabase functions logs trace-redirects --project-id rfhuqenntxiqurplenjn --tail 20
```

### Step 2.3: Edge Function Validation

**✅ Success Criteria:**
- [ ] Deployment completes without errors
- [ ] HTTP mode trace works correctly
- [ ] Bright Data error changed from "requires user context" to "provider not found"
- [ ] No 500 errors in function logs
- [ ] Response format unchanged

**❌ If ANY test fails:**
```bash
# STOP and rollback edge function immediately
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
git checkout HEAD~1 supabase/functions/trace-redirects/index.ts
supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn --no-verify-jwt

# Document the issue
echo "Edge function deployment failed on $(date)" >> deployment-log.txt
echo "Issue: [describe what failed]" >> deployment-log.txt

# DO NOT PROCEED to EC2 deployment
```

**⏸️ CHECKPOINT 2: Edge function deployed and verified**
- [ ] Edge function deployed successfully
- [ ] All tests passed
- [ ] user_context fix confirmed working
- [ ] Ready to proceed to EC2 deployment

---

## 📋 PHASE 3: SINGLE EC2 INSTANCE TEST

### Step 3.1: Backup EC2 Instance (Test Instance)

**Instance 1: 44.193.24.197 (Primary Test Instance)**

```bash
# Connect to instance
ssh -i suffix-server.pem ec2-user@44.193.24.197

# Create backup of current code
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/

# Verify backup
ls -lh suffix-tool-backup-*.tar.gz

# Keep only last 3 backups
ls -t suffix-tool-backup-*.tar.gz | tail -n +4 | xargs rm -f

echo "✅ Backup created"
```

### Step 3.2: Deploy to Test Instance

```bash
# Still connected to 44.193.24.197

# Navigate to project
cd suffix-tool

# Check current status
git log --oneline -3
pm2 status

# Pull latest changes
git fetch origin
git pull origin main

# Verify the new file exists
ls -la proxy-service/lib/proxy-providers-handler.js

# Check if server.js was updated
git log --oneline -1 proxy-service/server.js

# Restart the service
pm2 restart proxy-service

# Wait for service to initialize
sleep 5

# Check status
pm2 status

# Monitor logs for errors
pm2 logs proxy-service --lines 50 | grep -i "error\|proxy\|luna"
```

### Step 3.3: Comprehensive Testing on Test Instance

**Test 1: Health Check**
```bash
# From EC2 instance
curl -s http://localhost:3000/health | jq .

# Expected: {"status":"healthy",...}
```

**Test 2: HTTP Mode (No Proxy)**
```bash
# From EC2 instance
curl -s -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/redirect-to?url=https://example.com","mode":"http","max_redirects":10}' \
  | jq '.success, .total_steps, .final_url'

# Expected: success=true, total_steps >= 2
```

**Test 3: Browser Mode (Luna Proxy)**
```bash
# From EC2 instance
curl -s -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"browser","max_redirects":5,"timeout_ms":30000}' \
  | jq '.success, .steps[0].url, .final_url'

# Expected: success=true, URL traced
```

**Test 4: Anti-Cloaking Mode**
```bash
# From EC2 instance
curl -s -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"anti_cloaking","max_redirects":5}' \
  | jq '.success, .total_steps'

# Expected: success=true
```

**Test 5: Check Proxy IP in Logs**
```bash
# From EC2 instance
pm2 logs proxy-service --lines 100 | grep "Proxy IP used"

# Expected: Should see lines like "Proxy IP used: [IP address]"
# This confirms Luna proxy is actually working
```

**Test 6: Bright Data Browser API**
```bash
# From EC2 instance
curl -s -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://httpbin.org/ip",
    "mode":"brightdata_browser",
    "user_id":"f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b",
    "offer_id":"test_offer"
  }' | jq '.error, .details'

# Expected: "No enabled Bright Data Browser provider found"
# NOT: "requires user context" (that would indicate the fix didn't work)
```

**Test 7: Check for Errors**
```bash
# From EC2 instance
pm2 logs proxy-service --lines 200 | grep -i error | tail -20

# Expected: No new critical errors
# Some expected errors: "No enabled Bright Data Browser provider found" is OK
```

**Test 8: Monitor Resource Usage**
```bash
# From EC2 instance
pm2 monit  # Press Ctrl+C to exit after reviewing

# Check if CPU and Memory are normal
```

### Step 3.4: Test Instance Validation

**✅ All Tests Must Pass:**
- [ ] Health check returns "healthy"
- [ ] HTTP mode works (2+ steps traced)
- [ ] Browser mode works (traces with Luna proxy)
- [ ] Anti-cloaking mode works
- [ ] Proxy IPs showing in logs
- [ ] Bright Data error changed (not "requires user context")
- [ ] No new critical errors in logs
- [ ] PM2 shows service running and stable
- [ ] Memory usage normal (<80%)
- [ ] CPU usage normal (<50% baseline)

**❌ If ANY test fails:**
```bash
# ROLLBACK IMMEDIATELY on this instance
cd suffix-tool
git checkout HEAD~1
pm2 restart proxy-service

# Verify rollback worked
curl http://localhost:3000/health
pm2 logs proxy-service --lines 30

# Document the issue
exit  # Exit SSH

# On local machine
echo "EC2 deployment failed on $(date)" >> deployment-log.txt
echo "Instance: 44.193.24.197" >> deployment-log.txt
echo "Issue: [describe what failed]" >> deployment-log.txt

# Also rollback edge function
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
git checkout HEAD~1 supabase/functions/trace-redirects/index.ts
supabase functions deploy trace-redirects --project-id rfhuqenntxiqurplenjn --no-verify-jwt

# DO NOT PROCEED to other instances
```

### Step 3.5: Soak Test (10 minutes)

**Monitor the test instance for 10 minutes:**

```bash
# From local machine, in a separate terminal
watch -n 10 'ssh -i suffix-server.pem ec2-user@44.193.24.197 "cd suffix-tool && curl -s http://localhost:3000/health | jq .status"'

# In another terminal, monitor logs
ssh -i suffix-server.pem ec2-user@44.193.24.197
pm2 logs proxy-service --lines 100 --timestamp
# Watch for errors, crashes, or unusual behavior for 10 minutes
```

**During soak test, check:**
- [ ] No service crashes or restarts
- [ ] Error rate remains stable
- [ ] Response times normal
- [ ] Memory not increasing continuously
- [ ] No database connection issues
- [ ] Proxy connections remain stable

**❌ If issues during soak test:**
```bash
# Rollback immediately (follow rollback procedure above)
```

**⏸️ CHECKPOINT 3: Test instance validated**
- [ ] All functional tests passed
- [ ] Soak test completed (10 minutes, no issues)
- [ ] Service stable and responsive
- [ ] Error logs clean
- [ ] Resource usage normal
- [ ] Ready to proceed to remaining instances

---

## 📋 PHASE 4: REMAINING EC2 INSTANCES DEPLOYMENT

### Step 4.1: Deploy to Instance 2

**Instance 2: 3.215.185.91**

```bash
# Connect to instance 2
ssh -i suffix-server.pem ec2-user@3.215.185.91

# Create backup
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/

# Deploy
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5

# Quick validation
curl http://localhost:3000/health
pm2 logs proxy-service --lines 30 | grep -i error

# If all looks good, exit
exit
```

### Step 4.2: Test Instance 2

```bash
# From local machine
ssh -i suffix-server.pem ec2-user@3.215.185.91 << 'EOF'
  # Health check
  curl -s http://localhost:3000/health | jq .status
  
  # HTTP trace
  curl -s -X POST http://localhost:3000/trace \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' | jq .success
  
  # Check logs
  pm2 logs proxy-service --lines 50 | tail -20
EOF

# ✅ If tests pass, proceed to instance 3
# ❌ If tests fail, rollback instance 2 and stop
```

### Step 4.3: Deploy to Instance 3

**Instance 3: 18.209.212.159**

```bash
# Connect to instance 3
ssh -i suffix-server.pem ec2-user@18.209.212.159

# Create backup
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/

# Deploy
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5

# Quick validation
curl http://localhost:3000/health
pm2 logs proxy-service --lines 30 | grep -i error

# If all looks good, exit
exit
```

### Step 4.4: Test Instance 3

```bash
# From local machine
ssh -i suffix-server.pem ec2-user@18.209.212.159 << 'EOF'
  # Health check
  curl -s http://localhost:3000/health | jq .status
  
  # HTTP trace
  curl -s -X POST http://localhost:3000/trace \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' | jq .success
  
  # Check logs
  pm2 logs proxy-service --lines 50 | tail -20
EOF

# ✅ If tests pass, all instances deployed!
# ❌ If tests fail, rollback instance 3
```

### Step 4.5: All Instances Validation

**Create a quick validation script:**

```bash
cat > /tmp/validate-all.sh << 'EOF'
#!/bin/bash

INSTANCES=("44.193.24.197" "3.215.185.91" "18.209.212.159")

echo "======================================"
echo "Validating All EC2 Instances"
echo "======================================"

for instance in "${INSTANCES[@]}"; do
  echo ""
  echo "Testing $instance..."
  
  health=$(ssh -i suffix-server.pem ec2-user@$instance "curl -s http://localhost:3000/health | jq -r .status" 2>/dev/null)
  
  if [ "$health" = "healthy" ]; then
    echo "  ✅ Health check: PASS"
  else
    echo "  ❌ Health check: FAIL"
  fi
  
  pm2_status=$(ssh -i suffix-server.pem ec2-user@$instance "pm2 describe proxy-service | grep status" 2>/dev/null | grep online)
  
  if [ -n "$pm2_status" ]; then
    echo "  ✅ PM2 status: online"
  else
    echo "  ❌ PM2 status: NOT online"
  fi
done

echo ""
echo "======================================"
echo "Validation Complete"
echo "======================================"
EOF

chmod +x /tmp/validate-all.sh
/tmp/validate-all.sh
```

**⏸️ CHECKPOINT 4: All instances deployed**
- [ ] Instance 1 (44.193.24.197): Deployed and validated
- [ ] Instance 2 (3.215.185.91): Deployed and validated
- [ ] Instance 3 (18.209.212.159): Deployed and validated
- [ ] All health checks passing
- [ ] All PM2 services online
- [ ] Ready for monitoring phase

---

## 📋 PHASE 5: MONITORING & VALIDATION

### Step 5.1: Continuous Monitoring (30 minutes)

**Set up monitoring terminals:**

**Terminal 1: Health checks (all instances)**
```bash
watch -n 30 '/tmp/validate-all.sh'
```

**Terminal 2: Error logs (instance 1)**
```bash
ssh -i suffix-server.pem ec2-user@44.193.24.197
pm2 logs proxy-service --err --lines 100 --timestamp
```

**Terminal 3: Proxy connections (instance 1)**
```bash
ssh -i suffix-server.pem ec2-user@44.193.24.197
watch -n 10 'pm2 logs proxy-service --lines 50 --nostream | grep -i "proxy ip\|luna\|bright"'
```

### Step 5.2: Production Traffic Testing

**Test with real-world scenarios:**

```bash
# From local machine or testing environment

# Test 1: Real affiliate URL trace
curl -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{
    "url":"[real affiliate URL]",
    "mode":"browser",
    "max_redirects":20,
    "timeout_ms":60000
  }' | jq '.success, .total_steps, .final_url'

# Test 2: Multiple requests to test load
for i in {1..10}; do
  curl -s -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' \
    | jq -r '.success'
  sleep 2
done
```

### Step 5.3: Monitoring Checklist (30 minutes)

Monitor the following for 30 minutes:

**System Health:**
- [ ] All 3 instances remain healthy
- [ ] PM2 services stay online (no crashes)
- [ ] Memory usage stable
- [ ] CPU usage stable

**Functionality:**
- [ ] HTTP traces completing successfully
- [ ] Browser traces working with Luna proxy
- [ ] Proxy IPs rotating (different IPs in logs)
- [ ] Geo-targeting working (if tested)
- [ ] Response times within normal range

**Error Rates:**
- [ ] No increase in error rate
- [ ] No "requires user context" errors
- [ ] Expected errors only (like "provider not found")
- [ ] No database connection errors

**Bright Data Fix:**
- [ ] When testing brightdata_browser mode: error message changed
- [ ] No "requires user context" errors
- [ ] user_context being sent correctly (check logs)

### Step 5.4: Final Validation

**Run comprehensive test suite:**

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Test edge function
echo "Testing Edge Function..."
curl -s -X POST https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trace-redirects \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' \
  | jq '.success, .total_steps'

# Test instance 1
echo "Testing Instance 1..."
ssh -i suffix-server.pem ec2-user@44.193.24.197 \
  "curl -s http://localhost:3000/health | jq .status"

# Test instance 2
echo "Testing Instance 2..."
ssh -i suffix-server.pem ec2-user@3.215.185.91 \
  "curl -s http://localhost:3000/health | jq .status"

# Test instance 3
echo "Testing Instance 3..."
ssh -i suffix-server.pem ec2-user@18.209.212.159 \
  "curl -s http://localhost:3000/health | jq .status"

echo "✅ All components validated"
```

**⏸️ CHECKPOINT 5: Deployment complete**
- [ ] 30-minute monitoring period completed
- [ ] All systems stable
- [ ] No errors or issues detected
- [ ] Bright Data fix confirmed working
- [ ] Production traffic handling normally
- [ ] Deployment SUCCESSFUL ✅

---

## 📊 POST-DEPLOYMENT ACTIONS

### Update Documentation

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Create deployment success record
cat > deployment-success-$(date +%Y%m%d).txt << EOF
Deployment Successful: $(date)

Components Deployed:
- Supabase Edge Function: trace-redirects
- EC2 Instance 1: 44.193.24.197
- EC2 Instance 2: 3.215.185.91
- EC2 Instance 3: 18.209.212.159

Changes:
- Added user_context to Bright Data Browser API
- Created proxy-providers-handler.js
- Updated server.js and index.ts

Test Results:
- All functional tests: PASS
- All instances: healthy
- Error rate: stable
- Performance: normal

Issues: None

Rollback: Not required
EOF

# Tag successful deployment
git tag -a v1.0-deployed -m "Successful deployment - $(date +%Y-%m-%d)"
git push origin v1.0-deployed
```

### Continue Monitoring

**For the next 24 hours:**
- Check error logs every 2 hours
- Monitor proxy connections
- Track response times
- Watch for customer issues
- Keep rollback plan ready

```bash
# Schedule monitoring checks
echo "*/30 * * * * /tmp/validate-all.sh >> /var/log/deployment-monitor.log 2>&1" | crontab -
```

---

## 🚨 EMERGENCY PROCEDURES

**If critical issues arise during deployment:**

1. **STOP IMMEDIATELY**
2. **Follow ROLLBACK-PLAN.md**
3. **Document the issue**
4. **Notify team**
5. **Analyze root cause**

**Critical issue indicators:**
- Service crashes
- 500 errors
- Database timeouts
- Error rate spike >50%
- Customer complaints

---

## ✅ DEPLOYMENT SUCCESS CRITERIA

Deployment is successful when:

- ✅ All 3 EC2 instances deployed and healthy
- ✅ Supabase edge function deployed and working
- ✅ All trace modes functional
- ✅ Bright Data fix verified (error message changed)
- ✅ Proxy connections working
- ✅ Error rate stable or improved
- ✅ Response times normal
- ✅ No critical errors in logs
- ✅ 30-minute soak test passed
- ✅ Production traffic handled correctly

---

**Created:** January 14, 2026  
**Execution Time:** ~75 minutes  
**Risk Level:** LOW (incremental with rollback at every step)
