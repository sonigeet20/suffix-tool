# Manual AMI, Launch Template & ASG Update Guide

## Current Status
✅ All 3 EC2 instances updated with Trackier integration code:
- **44.200.149.184** (i-0f91d5f30bc5fbbb) - ✅ Deployed + Restarted
- **3.223.135.219** (i-0a77843bdcda2a6f7) - ✅ Deployed + Restarted (BEST SOURCE)
- **18.209.87.254** (i-0774e2d19a3efd70a) - ✅ Deployed + Restarted

All instances now have:
- `/proxy-service/routes/trackier-webhook.js` (Edge function integration)
- `/proxy-service/routes/trackier-trace.js` (Trace endpoint)

## Why Update AMI/Launch Template?
Without updating the AMI, any **new instances** launched by Auto Scaling will:
- ❌ Missing the `routes/` directory
- ❌ Missing Trackier webhook integration
- ❌ Fail to start properly

## Step-by-Step Manual Update

### Step 1: Create New AMI from Best Instance

**Instance to use**: `3.223.135.219` (i-0a77843bdcda2a6f7)
- This instance has both route files deployed successfully
- PM2 process running correctly

**AWS Console Steps**:
1. Go to [EC2 Console → Instances (us-east-1)](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Instances:)
2. Find instance with IP `3.223.135.219`
3. Right-click → **Image and templates** → **Create image**
4. Configure:
   - **Image name**: `url-tracker-proxy-trackier-20260111` (use today's date)
   - **Image description**: `URL Tracker Proxy with Trackier integration - Edge function + routes (deployed Jan 11, 2026)`
   - **No reboot**: ✅ **Enable** (keeps service running)
5. Click **Create image**
6. Wait for AMI status to become **Available** (2-5 minutes)
   - Go to [EC2 Console → AMIs](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Images:visibility=owned-by-me)
   - Note the **AMI ID** (e.g., `ami-0123456789abcdef0`)

### Step 2: Update Launch Template

1. Go to [EC2 Console → Launch Templates](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LaunchTemplates:)
2. Find your launch template (likely named `url-tracker-proxy-lt` or similar)
3. Select it → **Actions** → **Modify template (Create new version)**
4. In **Application and OS Images** section:
   - Click **Search by AMI ID**
   - Enter the **new AMI ID** from Step 1
5. Scroll to bottom → Click **Create template version**
6. Once created, go back to Launch Templates list
7. Select your template → **Actions** → **Set default version**
8. Choose the **new version number** → **Set as default version**

### Step 3: Update Auto Scaling Group (Optional but Recommended)

**Option A: Gradual Rolling Update (Recommended)**
1. Go to [EC2 Console → Auto Scaling Groups](https://console.aws.amazon.com/ec2autoscaling/home?region=us-east-1#/details)
2. Find your ASG (check which ASG uses your launch template)
3. Select it → **Start instance refresh**
4. Configure:
   - **Minimum healthy percentage**: 66% (keeps 2 out of 3 instances running)
   - **Instance warmup**: 60 seconds
5. Click **Start instance refresh**
6. ASG will gradually replace old instances with new ones (takes 5-10 minutes)

**Option B: Manual Instance Termination**
1. Terminate old instances one-by-one
2. ASG will automatically launch new instances using the new AMI
3. Wait for each new instance to be healthy before terminating the next

**Option C: Do Nothing**
- Current instances will keep running with updated code
- New instances (when scaled) will use the new AMI automatically

### Step 4: Verify New Instances

After ASG launches new instances:

1. SSH into a new instance:
   ```bash
   ssh -i ~/Downloads/suffix-server.pem ec2-user@<NEW_INSTANCE_IP>
   ```

2. Verify routes directory exists:
   ```bash
   ls -la ~/proxy-service/routes/
   # Should see: trackier-webhook.js, trackier-trace.js
   ```

3. Check PM2 status:
   ```bash
   pm2 list
   # Should show proxy-server or proxy-service running
   ```

4. Check logs for errors:
   ```bash
   pm2 logs --lines 50
   ```

## Verification Checklist

After completing all steps:

- [ ] New AMI created and **Available**
- [ ] Launch Template updated with new AMI
- [ ] Launch Template default version set to new version
- [ ] ASG instance refresh started (if using Option A)
- [ ] New instances have `/proxy-service/routes/` directory
- [ ] PM2 processes running on new instances
- [ ] No errors in PM2 logs
- [ ] Webhook endpoint responding: `curl http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/health`

## Important Notes

- ⚠️ **The current 3 instances already have the updated code** - they will continue working fine
- ⚠️ **This update is for future instances** launched by Auto Scaling
- ✅ No downtime required - use no-reboot AMI creation
- ✅ Rolling update keeps service available throughout

## Next Steps After AMI Update

1. **Apply Supabase migration**: Run [20260110025000_fix_trackier_columns.sql](../supabase/migrations/20260110025000_fix_trackier_columns.sql) in Supabase SQL Editor
2. **Update Trackier config**: Change `update_interval_seconds` from 300 to 1 in production UI
3. **Configure S2S Push URL**: Add `http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-webhook` to Trackier campaigns 310 and 309
4. **Test webhook**: Send test webhook to verify everything works

## Troubleshooting

**If new instances fail to start:**
1. Check Launch Template security group settings
2. Verify IAM role is attached
3. Check User Data script (if any)
4. Review CloudWatch logs

**If routes directory missing on new instance:**
- The AMI was created from wrong instance or before deployment
- Recreate AMI from a confirmed working instance

**If PM2 not starting:**
- SSH into instance and manually start: `cd proxy-service && pm2 start server.js --name proxy-server`
- Check if node_modules are present
- Verify .env file exists
