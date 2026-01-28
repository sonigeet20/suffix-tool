# AMI and Launch Template Update - COMPLETE ✅

**Date:** January 28, 2026  
**Status:** All changes applied successfully

---

## Summary

Successfully created new AMI with Google Ads click tracking and GeoIP datacenter detection, updated the launch template, and configured the ASG for rollout.

---

## Changes Made

### 1. New AMI Created
- **AMI ID:** `ami-0d37efc2909a09424`
- **AMI Name:** `proxy-google-ads-geoip-20260128-204431`
- **Source Instance:** `i-0a8553a86f733cba2` (13.222.100.70)
- **Status:** ✅ Available

**Features in new AMI:**
- ✅ Google Ads click tracking with event logging
- ✅ GeoIP datacenter detection (configured to use 3.215.176.40:3000)
- ✅ MaxMind GeoLite2 integration
- ✅ All recent proxy service updates

### 2. Launch Template Updated
- **Template ID:** `lt-0d0c3ed5e9a25c190`
- **Template Name:** `url-tracker-proxy-template`
- **New Version:** 25
- **Previous Default:** Version 24 (AMI: `ami-0998893d5a268ec8b`)
- **New Default:** Version 25 (AMI: `ami-0d37efc2909a09424`)
- **Status:** ✅ Set as default

**Version 25 Configuration:**
```json
{
  "ImageId": "ami-0d37efc2909a09424",
  "InstanceType": "t3.large",
  "KeyName": "browser-automation-key",
  "SecurityGroupIds": ["sg-08b44ed01825cbbb8"],
  "VersionDescription": "v25: Google Ads click tracking + GeoIP datacenter detection"
}
```

### 3. Auto Scaling Group Updated
- **ASG Name:** `url-tracker-proxy-asg`
- **Launch Template:** `lt-0d0c3ed5e9a25c190` (url-tracker-proxy-template)
- **Launch Template Version:** `$Latest` (points to v25)
- **Status:** ✅ Updated

**Current ASG Config:**
- Min Size: 2
- Max Size: 10
- Desired Capacity: 2
- AZs: us-east-1a, us-east-1b

---

## Current Running Instances

All 6 instances are from the old AMI and will be replaced on next scale event:

| IP | Instance ID | Status | Current AMI |
|---|---|---|---|
| 13.222.100.70 | i-0a8553a86f733cba2 | running | ami-0998893d5a268ec8b |
| 44.215.112.238 | i-06a81a3947127990d | running | ami-0998893d5a268ec8b |
| 100.29.190.60 | i-0219fd460ba031beb | running | ami-0998893d5a268ec8b |
| 44.200.222.95 | i-0b36a1b4aabbd9217 | running | ami-0998893d5a268ec8b |
| 100.53.41.66 | i-0ded2b0ddf0a1e779 | running | ami-0998893d5a268ec8b |
| 3.239.71.2 | i-0c7261978ce636397 | running | ami-0998893d5a268ec8b |

---

## Rollout Options

### Option 1: Manual Rollout (Recommended for testing)
Replace instances one at a time:

```bash
# Terminate one instance at a time
aws ec2 terminate-instances --instance-ids i-0a8553a86f733cba2
# Wait for ASG to launch replacement with new AMI
# Repeat for other instances
```

### Option 2: ASG Refresh
AWS will terminate and replace instances:

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name url-tracker-proxy-asg \
  --preferences '{"MinHealthyPercentage": 50, "InstanceWarmup": 300}'
```

### Option 3: Do Nothing
New instances from ASG scale-out will use v25 AMI automatically.

---

## Verification

### Check AMI Details
```bash
aws ec2 describe-images --image-ids ami-0d37efc2909a09424 \
  --query 'Images[0].[ImageId,State,CreationDate,Name]' \
  --output text
```

### Check Launch Template Version
```bash
aws ec2 describe-launch-template-versions \
  --launch-template-id lt-0d0c3ed5e9a25c190 \
  --versions 25 \
  --query 'LaunchTemplateVersions[0].[VersionNumber,VersionDescription,LaunchTemplateData.ImageId]' \
  --output text
```

### Check ASG Configuration
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names url-tracker-proxy-asg \
  --query 'AutoScalingGroups[0].[LaunchTemplate,MinSize,MaxSize,DesiredCapacity]' \
  --output text
```

---

## What's Included in New AMI

### Google Ads Click Tracking
- **File:** `/home/ec2-user/proxy-service/routes/google-ads-click.js`
- **Features:**
  - Click event logging to Supabase
  - Trace verification
  - Auto-refill mechanism
  - User agent and referrer capture
  - Response time tracking

### GeoIP Service Integration
- **File:** `/home/ec2-user/proxy-service/routes/google-ads-click.js` (lines 22-23)
- **Configuration:**
  - `GEOIP_SERVICE_URL=http://3.215.176.40:3000`
  - Datacenter detection enabled
  - ASN-based filtering
  - Organization name matching

### MaxMind Configuration
- **License Key:** Stored in Supabase `settings.maxmind_license_key`
- **Databases:** GeoLite2-City and GeoLite2-ASN
- **GeoIP Service:** Running on dedicated instance (3.215.176.40:3000)

---

## Next Steps

1. **Test New AMI** (Optional but recommended)
   - Start a test instance with v25 to verify all features work
   - Test Google Ads click tracking
   - Verify GeoIP service connectivity

2. **Monitor Current Instances**
   - Continue monitoring 6 running instances
   - They will automatically use v25 when replaced

3. **Initiate Rollout** (Choose one)
   - Manual: Terminate instances one at a time
   - Automatic: Use ASG instance refresh
   - On-demand: Wait for scale-out events

4. **Verify Post-Rollout**
   - Confirm new instances report in `/click/health`
   - Check Google Ads click events are logging
   - Verify GeoIP lookups working

---

## Rollback Plan (if needed)

If v25 has issues, revert to v24:

```bash
# Set version 24 as default
aws ec2 modify-launch-template \
  --launch-template-id lt-0d0c3ed5e9a25c190 \
  --default-version 24

# Update ASG
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name url-tracker-proxy-asg \
  --launch-template LaunchTemplateId=lt-0d0c3ed5e9a25c190,Version='24'
```

---

## Files and Resources

**AMI:**
- ID: `ami-0d37efc2909a09424`
- Name: `proxy-google-ads-geoip-20260128-204431`

**Launch Template:**
- ID: `lt-0d0c3ed5e9a25c190`
- Name: `url-tracker-proxy-template`
- Current Default Version: 25
- Current Latest Version: 25

**Auto Scaling Group:**
- Name: `url-tracker-proxy-asg`
- Launch Template Version: `$Latest`

**GeoIP Service:**
- Instance: `i-08ac8dc9194356f09` (3.215.176.40)
- Port: 3000
- Status: Running

---

## Deployment Complete ✅

- ✅ New AMI created with all latest code
- ✅ Launch template version 25 created and set as default
- ✅ ASG configured to use latest version
- ✅ Ready for instance replacement
- ✅ Rollback plan in place
