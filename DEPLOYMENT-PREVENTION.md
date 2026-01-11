# DEPLOYMENT & INCIDENT PREVENTION GUIDE

## 🚨 CRITICAL LESSONS LEARNED

### Incident: PM2 Restart Loop (755+ Restarts)
**Root Cause:** Two PM2 processes (proxy-server + proxy-service) both trying to bind port 3000  
**Impact:** CPU spike, EADDRINUSE errors, cascading restarts  
**Recovery Time:** ~30 minutes across all 6 instances  
**Prevention:** Implementation of startup validation and ecosystem config

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### 1. Local Testing
- [ ] Run `npm install` in proxy-service
- [ ] Start locally: `npm start`
- [ ] Test API endpoints: `/api/trackier-status`, `/api/trackier-emergency-toggle`
- [ ] Verify no console errors in logs
- [ ] Test webhook functionality if changing webhook code

### 2. Code Review
- [ ] All changes committed to Git
- [ ] No hardcoded credentials
- [ ] No console.log() in production code (use info/error loggers)
- [ ] All error cases handled gracefully
- [ ] Timeout protection for external API calls (30-second limit)

### 3. Git Workflow
```bash
# Commit message format:
git commit -m "Fix: [issue] - Brief description"

# Examples:
git commit -m "Fix: Add 30-second timeout to edge function calls"
git commit -m "Fix: Webhook URL to include token and Trackier macros"
git commit -m "Fix: PM2 process validation at startup"
```

### 4. Database Migrations
- [ ] If adding/removing columns, apply migration to development first
- [ ] Test migration in staging (Supabase dev environment)
- [ ] Keep migration file (never delete, only new ones)
- [ ] Document column purposes in migration file

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Prepare Instance
```bash
# SSH into instance
ssh -i ~/Downloads/suffix-server.pem ec2-user@<IP>

# Go to service directory
cd ~/proxy-service

# Ensure only ONE process exists
pm2 list | grep proxy

# If duplicates exist, run validation script
bash scripts/validate-startup.sh
```

### Step 2: Pull Latest Code
```bash
# Fetch latest changes
git pull origin main

# Install dependencies
npm install

# Verify no errors
npm ls --depth=0
```

### Step 3: Deploy with PM2 Ecosystem Config
```bash
# Option A: Using ecosystem config (recommended)
pm2 start ecosystem.config.js --only proxy-service

# Option B: Manual start (if config not available)
pm2 start server.js --name proxy-service

# Always save PM2 state
pm2 save
```

### Step 4: Verify Deployment
```bash
# Check process status
pm2 status

# Verify single process online with 0 restarts
# Output should show:
# │ 0  │ proxy-service │ online │ 0% │ 0 │

# Check recent logs (last 20 lines)
pm2 logs proxy-service --lines 20 --nostream

# Test API health
curl http://localhost:3000/api/trackier-status

# Expected response: {"enabled":true/false, "active_offers":0, ...}
```

### Step 5: Load Balancer Health Check
```bash
# From local machine, test via ALB
curl http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-status

# Verify all 3 instances in ALB target group are "Healthy"
# AWS Console > EC2 > Load Balancers > url-tracker-proxy-alb
```

---

## ⚠️ PROCESS VALIDATION RULES

### What NOT to do:
- ❌ Start multiple PM2 processes manually
- ❌ Start services with hardcoded port numbers without checking port availability
- ❌ Leave old processes running when updating code
- ❌ Restart without verifying previous process stopped

### What TO do:
- ✅ Use ecosystem.config.js for consistent configuration
- ✅ Run validation script before starting: `bash scripts/validate-startup.sh`
- ✅ Always check `pm2 status` before and after deployment
- ✅ Monitor for EADDRINUSE errors in logs
- ✅ Implement automatic restart limits (max 10 restarts in config)

---

## 🔧 TROUBLESHOOTING RESTART LOOPS

### If you see EADDRINUSE errors:

```bash
# 1. Find what's using port 3000
lsof -i :3000

# 2. Kill all processes
pm2 delete all
sudo pkill -9 node

# 3. Check port is free
lsof -i :3000  # Should return nothing

# 4. Restart clean
cd ~/proxy-service
bash scripts/validate-startup.sh

# 5. Verify single process
pm2 status | grep online
```

### If process keeps restarting:
```bash
# Check error logs
pm2 logs proxy-service --lines 50

# Common causes:
# - Port already in use (see above)
# - Node.js memory limit hit
# - Unhandled exception in code
# - Missing environment variables
```

---

## 📊 PRODUCTION SAFEGUARDS IMPLEMENTED

### 1. Timeout Protection (30 seconds)
- All edge function calls wrapped in AbortController
- Prevents hung requests from consuming resources
- Location: `/proxy-service/routes/trackier-webhook.js:345-386`

### 2. Emergency Kill Switch
- Endpoint: `POST /api/trackier-emergency-toggle?enabled=false`
- Allows disabling Trackier without restarting
- Runtime toggleable (no server restart needed)
- Location: `/proxy-service/routes/trackier-webhook.js:721-740`

### 3. PM2 Restart Limits
- Max restarts: 10 per instance
- Min uptime: 10 seconds before restart counts
- Max memory: 500MB (auto-restart if exceeded)
- Single instance mode (no clustering)

### 4. Startup Validation Script
- Checks for duplicate processes
- Validates port availability
- Ensures single process startup
- Location: `/proxy-service/scripts/validate-startup.sh`

### 5. Process Monitoring
- Always check: `pm2 status`
- Watch for: restart count > 5
- Alert on: "EADDRINUSE" in logs
- Restart count should stay at 0

---

## 🚨 INCIDENT RESPONSE

### If High CPU Usage Detected:

1. **Immediate Actions** (2 minutes)
   ```bash
   # Disable problematic feature via kill switch
   curl -X POST http://localhost:3000/api/trackier-emergency-toggle?enabled=false
   ```

2. **Diagnosis** (5 minutes)
   ```bash
   # Check logs for errors
   pm2 logs proxy-service --lines 100 | grep -i error
   
   # Check restart count
   pm2 status | grep proxy-service
   
   # If restarting: CPU spike likely due to crash loop
   ```

3. **Recovery** (10 minutes)
   ```bash
   # Run validation script
   bash scripts/validate-startup.sh
   
   # Pull latest code if needed
   git pull origin main
   npm install
   pm2 restart proxy-service
   ```

4. **Verification** (5 minutes)
   ```bash
   # Verify recovery
   pm2 status
   curl http://localhost:3000/api/trackier-status
   
   # Once stable, re-enable feature
   curl -X POST http://localhost:3000/api/trackier-emergency-toggle?enabled=true
   ```

---

## 📝 LOGS TO MONITOR

### Health Indicators (Good)
```
✅ Info logs showing initialization
✅ Successful HTTP requests (301, 302, 404 codes)
✅ Clean startup with no EADDRINUSE errors
✅ Memory usage 100-150MB
✅ CPU usage 0-5%
```

### Warning Signs (Bad)
```
⚠️ EADDRINUSE errors (port conflict)
⚠️ Memory spikes above 300MB
⚠️ Restart count increasing (> 5)
⚠️ Timeout errors on external calls
⚠️ Unhandled exceptions in logs
```

---

## 🔄 MAINTENANCE SCHEDULE

### Daily
- [ ] Check PM2 status: `pm2 status`
- [ ] Monitor ALB target health: AWS Console
- [ ] Watch for error spikes in logs

### Weekly
- [ ] Review PM2 logs for patterns: `pm2 logs proxy-service --lines 200`
- [ ] Check disk space: `df -h`
- [ ] Verify no restart loops: `pm2 status`

### Monthly
- [ ] Update ecosystem.config.js with latest settings
- [ ] Review and clean PM2 logs: `pm2 flush`
- [ ] Test failover: manually stop one instance, verify others handle traffic

---

## 📚 REFERENCES

- **Timeout Protection**: [proxy-service/routes/trackier-webhook.js](proxy-service/routes/trackier-webhook.js#L345-L386)
- **Kill Switch Endpoint**: [proxy-service/routes/trackier-webhook.js](proxy-service/routes/trackier-webhook.js#L721-L740)
- **PM2 Ecosystem Config**: [proxy-service/ecosystem.config.js](ecosystem.config.js)
- **Startup Validation**: [proxy-service/scripts/validate-startup.sh](scripts/validate-startup.sh)
- **Webhook Integration**: [src/components/TrackierSetup.tsx](../src/components/TrackierSetup.tsx#L420-L440)

---

Last Updated: January 11, 2026  
Incident: PM2 Restart Loop (755+ restarts on port 3000 conflict)  
Status: ✅ RESOLVED - All 6 instances stable with safeguards
