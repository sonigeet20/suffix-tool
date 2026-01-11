# Emergency Recovery Guide - High CPU on AWS

## Current Status (2026-01-11 11:15 UTC)

**Problem:** 
- SSH timing out on all 3 EC2 instances
- Trackier traces failing (0.0% success rate)
- Edge function likely timing out causing CPU spike

**Root Cause:**
- processTrackierUpdate() calling edge function with no timeout
- Failed traces possibly retrying infinitely
- 30-second edge function calls piling up

## Immediate Actions (Do These Now)

### Option 1: Stop Trackier via Supabase (Fastest)
```sql
-- Run in Supabase SQL Editor
UPDATE trackier_offers 
SET enabled = false 
WHERE id = '16176089-e436-4781-8c92-cb3475203582';
```

This will stop new webhook processing immediately.

### Option 2: AWS Console Recovery
1. Go to AWS EC2 Console
2. Select all 3 instances:
   - ec2-44-202-19-125.compute-1.amazonaws.com
   - ec2-44-215-222-132.compute-1.amazonaws.com
   - ec2-54-174-6-178.compute-1.amazonaws.com

3. **Option A: Restart instances** (safest)
   - Actions → Instance State → Reboot
   - Wait 2-3 minutes
   - Check ALB health

4. **Option B: Stop/Start** (if reboot doesn't work)
   - Actions → Instance State → Stop
   - Wait until stopped
   - Actions → Instance State → Start
   - Update ALB target group if needed

### Option 3: Systems Manager (if SSH fails)
```bash
# Use AWS CLI with Session Manager
aws ssm start-session --target i-INSTANCE_ID

# Once connected:
pm2 stop proxy-service
pm2 delete proxy-service
export TRACKIER_ENABLED=false
cd ~/suffix-tool-main\ 2/proxy-service
git pull origin main
npm install
pm2 start server.js --name proxy-service
pm2 save
```

## After Recovery - Deploy Fixes

Once instances are responsive again:

```bash
# 1. Update code on all instances
KEY="~/Downloads/suffix-server.pem"

for HOST in ec2-44-202-19-125.compute-1.amazonaws.com ec2-44-215-222-132.compute-1.amazonaws.com ec2-54-174-6-178.compute-1.amazonaws.com; do
  ssh -i $KEY ubuntu@$HOST << 'EOF'
    cd ~/suffix-tool-main\ 2/proxy-service
    git pull origin main
    npm install
    pm2 restart proxy-service
    pm2 save
    pm2 logs proxy-service --lines 20 --nostream
EOF
done
```

## New Features (Already Pushed to GitHub)

1. **Emergency Kill Switch**
   ```bash
   # Disable Trackier without restart
   curl -X POST "http://ALB/api/trackier-emergency-toggle?enabled=false"
   
   # Re-enable when ready
   curl -X POST "http://ALB/api/trackier-emergency-toggle?enabled=true"
   ```

2. **30-Second Timeout on Edge Function**
   - Prevents hanging on slow traces
   - Better error messages

3. **Runtime Toggle**
   - TRACKIER_ENABLED now runtime changeable
   - No restart needed

## Verification

After recovery:
```bash
# Check status
curl http://ALB/api/trackier-status

# Should see:
# - enabled: false (or true if re-enabled)
# - Low CPU usage
# - SSH responsive

# Check instance health
ssh -i $KEY ubuntu@$HOST "uptime && pm2 status"
```

## Prevention

1. **Set higher update interval** (reduce trace frequency)
   ```sql
   UPDATE trackier_offers 
   SET update_interval_seconds = 300  -- 5 minutes
   WHERE id = '16176089-e436-4781-8c92-cb3475203582';
   ```

2. **Monitor edge function**
   - Check Supabase Functions logs
   - Verify LUNA proxy pool isn't exhausted
   - Check if offer URL is valid

3. **Add CloudWatch Alarms**
   - CPU > 80% for 5 minutes
   - Memory > 80%
   - Health check failures

## Support Info

- ALB: url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com
- Instances: 3x t3.medium (us-east-1)
- PM2 process: proxy-service
- Logs: `pm2 logs proxy-service`
