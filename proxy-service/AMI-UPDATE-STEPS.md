# AMI Update - Manual Steps (AWS Console Only)

**Status**: ✅ All 3 EC2 instances have Trackier integration deployed
- Instance 1: 3.223.135.219 (i-0a77843bdcda2a6f7) ✅ BEST - Use this one for AMI
- Instance 2: 44.200.149.184 (i-0f91d5f30bc5fbbbb) ✅
- Instance 3: 18.209.87.254 (i-0774e2d19a3efd70a) ✅

---

## Why Update AMI?

The **current instances are working perfectly** with:
- ✅ `routes/trackier-webhook.js` deployed
- ✅ `routes/trackier-trace.js` deployed
- ✅ PM2 processes running
- ✅ Edge function integration active

**However**, when Auto Scaling launches **NEW instances**, they will use the old AMI and won't have these files. Updating the AMI ensures all future instances are consistent.

---

## Step-by-Step Instructions

### Step 1️⃣: Open AWS EC2 Console

Go to: https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Instances:

### Step 2️⃣: Find Instance to Use for AMI

Find the instance with **Public IPv4 address: 3.223.135.219**

This instance has:
- Instance ID: `i-0a77843bdcda2a6f7`
- All Trackier files deployed
- PM2 running correctly

**Click on this instance row** to select it.

### Step 3️⃣: Create AMI (Amazon Machine Image)

With the instance selected:

1. Click the **Instance State** dropdown at top
2. Hover over **Image and templates**
3. Click **Create image**

Fill in the form:
- **Image name**: `url-tracker-proxy-trackier-20260111`
- **Image description**: `URL Tracker Proxy with Trackier integration - Edge function + routes deployed Jan 11, 2026`
- **No reboot**: Make sure this is ✅ **Checked** (we want no-reboot mode)

Then click **Create image**

### Step 4️⃣: Wait for AMI to Complete

This takes 2-5 minutes. You'll see status change from:
- `pending` → `available`

**While waiting**, you can proceed to Step 5 or monitor progress at:
https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Images:visibility=owned-by-me

### Step 5️⃣: Get the New AMI ID

Go to: https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Images:visibility=owned-by-me

Find the AMI you just created (it will be at the top with `url-tracker-proxy-trackier-20260111` name)

**Copy the AMI ID** (starts with `ami-`, like `ami-0123456789abcdef`)

**Save this somewhere!** You'll need it in the next step.

### Step 6️⃣: Update Launch Template

Go to: https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LaunchTemplates:

1. Find your launch template (look for one that starts with `url-tracker` or `proxy`)
2. Click on it to select it
3. Click the **Actions** dropdown
4. Click **Create new version**

In the launch template version form:

**Find the "Application and OS Images (Amazon Machine Image)" section:**
- Look for the current AMI ID
- Click **Search by AMI ID**
- **Paste** the NEW AMI ID you copied in Step 5
- Press Enter or click the search result

Scroll down and click **Create template version**

### Step 7️⃣: Set New Version as Default

1. Go back to Launch Templates: https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LaunchTemplates:
2. Find your template again
3. Click **Actions** dropdown
4. Click **Set default version**
5. Choose the **NEW version number** (it will be highest number)
6. Click **Set as default version**

✅ **Launch Template is now updated!**

---

## Step 8️⃣ (Optional): Update Auto Scaling Group

This step is **optional** but recommended to replace old instances.

Go to: https://console.aws.amazon.com/ec2autoscaling/home?region=us-east-1#/details

1. Find your Auto Scaling Group
2. Click on it
3. Click **Instance refresh** tab
4. Click **Start instance refresh**

Configure:
- **Minimum healthy percentage**: `66` (keeps 2/3 instances running)
- **Instance warmup in seconds**: `60`

Click **Start instance refresh**

This will gradually replace your 3 instances with new ones using the updated AMI.

---

## Verification Checklist

- [ ] AMI created and status is "Available"
- [ ] AMI ID copied
- [ ] Launch template version created with new AMI
- [ ] New version set as default
- [ ] (Optional) Instance refresh started

---

## What Happens Next?

### Immediately:
- ✅ Current 3 instances keep running with Trackier code
- ✅ No downtime

### When ASG launches new instances:
- ✅ New instances will have `routes/trackier-webhook.js`
- ✅ New instances will have `routes/trackier-trace.js`
- ✅ Everything ready automatically

### If you DON'T update Launch Template:
- ⚠️ New instances will NOT have Trackier files
- ⚠️ They will fail to start properly
- ⚠️ Webhooks won't work on new instances

---

## Troubleshooting

**Q: What if I make a mistake creating the new version?**
A: Just create another version. You can have multiple versions. Set the correct one as default.

**Q: How do I know if instance refresh worked?**
A: Go to Auto Scaling Groups → Your ASG → Instance refresh tab. You'll see progress.

**Q: Will there be downtime during instance refresh?**
A: No! With MinHealthyPercentage=66, AWS keeps 2 instances running while 1 is replaced.

**Q: Where can I see the new instances launching?**
A: EC2 → Instances. You'll see new ones appear with newer Launch Times.

---

## After AMI Update Complete

Still need to do:

1. **Apply Supabase migration**: Copy [20260110025000_fix_trackier_columns.sql](../supabase/migrations/20260110025000_fix_trackier_columns.sql) content and run in Supabase SQL Editor
2. **Update Trackier config**: Change `update_interval_seconds` from 300 to 1 in production UI
3. **Configure S2S Push URL**: Add webhook URL to Trackier dashboard (campaigns 310 and 309)
