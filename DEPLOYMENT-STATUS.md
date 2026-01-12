# Deployment Status - January 12, 2026

## Current Code Status
✅ **GitHub:** Latest code committed and pushed
- Commit: f3a6402 - JWT verification removed
- Previous: 2bbd87b - Brightdata cleanup + Trackier integration v2

✅ **Supabase:** Edge function deployed with --no-verify-jwt
- Function: trace-redirects
- Status: Public endpoint (no JWT required)

⚠️ **EC2 Instances:** NOT YET UPDATED
- Instances running: 4 total
  - 44.193.24.197 (url-tracker-proxy-instance) - t3.large - running
  - 3.215.185.91 (url-tracker-proxy-instance) - t3.large - running
  - 18.209.212.159 (url-tracker-proxy-instance) - t3.large - running
  - 13.218.100.97 (browser-automation-server) - t3.large - running

**Status on Instances:** ❌ Missing Trackier Routes
- server.js imports trackier routes but routes not present on disk
- Endpoint test: `Cannot POST /api/trackier-trace-once`

## Required Files NOT ON INSTANCES
These files need to be deployed to `/opt/url-tracker-proxy/routes/`:
1. `trackier-webhook.js` - Main Trackier webhook handler
2. `trackier-trace.js` - Single trace endpoint 
3. `trackier-polling.js` - Polling job for click count updates

## Next Steps

### Option A: Git Pull (Recommended if git is configured)
```bash
for ip in 44.193.24.197 3.215.185.91 18.209.212.159; do
  ssh -i KEY ec2-user@$ip "cd /opt/url-tracker-proxy && git pull origin main && pm2 restart all"
done
```

### Option B: SCP Deploy
```bash
for ip in 44.193.24.197 3.215.185.91 18.209.212.159; do
  scp -i KEY proxy-service/routes/trackier-*.js ec2-user@$ip:/opt/url-tracker-proxy/routes/
  scp -i KEY proxy-service/server.js ec2-user@$ip:/opt/url-tracker-proxy/server.js
  ssh -i KEY ec2-user@$ip "pm2 restart all"
done
```

### Option C: Use New AMI
Since we have `ami-061d6eb866a8b1254` (created earlier with v16 Launch Template):
- Terminate current instances
- Let ASG auto-scale new instances from Launch Template v16
- New instances will have all code

## Instances Details

| Instance ID | IP | Type | Name | Status | Trackier Routes |
|---|---|---|---|---|---|
| i-0e5fca1fc3856ab35 | 44.193.24.197 | t3.large | url-tracker-proxy-instance | running | ❌ |
| i-0789cfbe7994a4c2d | 3.215.185.91 | t3.large | url-tracker-proxy-instance | running | ❌ |
| i-0e5ed691dadd9cef6 | 18.209.212.159 | t3.large | url-tracker-proxy-instance | running | ❌ |
| i-0b7f630295c40461f | 13.218.100.97 | t3.large | browser-automation-server | running | N/A |

## AWS Infrastructure Status
✅ Load Balancer: `url-tracker-proxy-alb` (active)
✅ Auto Scaling Group: `url-tracker-proxy-asg`
✅ Launch Template: version 16 (default, with ami-061d6eb866a8b1254)
✅ Security Groups: Properly configured

## What Works
- ✅ Supabase edge function (trace-redirects) - public, no JWT
- ✅ GitHub repo updated
- ✅ Server.js compiles and imports routes
- ✅ Instances are healthy and responding

## What's Missing
- ❌ Route files on EC2 instances
- ❌ Trackier webhook endpoints
- ❌ Trackier trace endpoints
- ❌ Trackier polling endpoints
