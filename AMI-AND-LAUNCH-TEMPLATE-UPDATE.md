# AMI & Launch Template Update - Google Ads Infrastructure ✅

## Summary
Successfully created a new AMI from the latest Google Ads instance, created a new launch template version with that AMI, and updated the ASG to use it for all future instances.

## Changes Made

### 1. New AMI Created
**AMI ID**: `ami-049f5a67a049b393d`
**Name**: `url-tracker-google-ads-20260128-220645`
**Base Instance**: `i-0a8553a86f733cba2` (13.222.100.70)
**Status**: Available ✅
**Contents**: Latest google-ads-click.js with full filtration logic deployed

### 2. Launch Template Updated
**Template ID**: `lt-0d0c3ed5e9a25c190`
**Template Name**: `url-tracker-proxy-template`
**New Version**: Latest (auto-incremented)
**Created**: 2026-01-28T16:41:35+00:00
**Specifications**:
- **AMI**: `ami-049f5a67a049b393d` (NEW)
- **Instance Type**: t3.large
- **Key Pair**: suffix-server
- **Security Group**: sg-086e54c5d9448aa01

**Previous Version**:
- **AMI**: ami-0d37efc2909a09424 (OLD)
- **Created**: 2026-01-28T15:37:54+00:00

### 3. Auto Scaling Group Updated
**ASG Name**: `url-tracker-proxy-asg`
**Status**: Updated to use $Latest launch template version ✅
**Configuration**:
- **Min Size**: 6
- **Max Size**: 15
- **Desired Capacity**: 6 (no change to current instances)
- **Current Running**: 6 instances
- **Launch Template**: Using latest version with new AMI

### 4. Current Instances (Unchanged)
All 6 instances continue running with current deployment:
- `i-0a8553a86f733cba2` - 13.222.100.70
- `i-06a81a3947127990d` - 44.215.112.238
- `i-0219fd460ba031beb` - 100.29.190.60
- `i-0b36a1b4aabbd9217` - 44.200.222.95
- `i-0ded2b0ddf0a1e779` - 100.53.41.66
- `i-0c7261978ce636397` - 3.239.71.2

## What This Enables

### Future Instance Launches
When ASG launches new instances (due to scale-up, replacement, or manual launch):
1. Uses `url-tracker-proxy-template` launch template
2. Automatically pulls latest AMI version (`ami-049f5a67a049b393d`)
3. New instances include all latest code:
   - google-ads-click.js with complete filtering logic
   - All dependencies and configurations
   - PM2 configurations

### Scale-Up Scenario
If you increase DesiredCapacity:
```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name url-tracker-proxy-asg \
  --desired-capacity 10
```
ASG will:
1. Launch 4 new instances (10 - 6 current)
2. Use the new AMI `ami-049f5a67a049b393d`
3. Each new instance starts with full Google Ads functionality

### Instance Replacement
If you terminate an instance manually or ASG detects an unhealthy instance:
1. ASG automatically launches a replacement
2. Replacement uses the new AMI
3. No manual deployment needed

## Rollback Plan

If you need to rollback to the previous AMI:

```bash
# Create a new template version with the old AMI
aws ec2 create-launch-template-version \
  --launch-template-id lt-0d0c3ed5e9a25c190 \
  --launch-template-data '{
    "ImageId": "ami-0d37efc2909a09424",
    "InstanceType": "t3.large",
    "KeyName": "suffix-server",
    "SecurityGroupIds": ["sg-086e54c5d9448aa01"]
  }'

# Update ASG to use latest version (which will be the old AMI)
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name url-tracker-proxy-asg \
  --launch-template LaunchTemplateId=lt-0d0c3ed5e9a25c190,Version='$Latest'
```

## Infrastructure Isolation

This update only affects the Google Ads proxy infrastructure:
- **ASG**: `url-tracker-proxy-asg` (UPDATED)
- **Launch Template**: `url-tracker-proxy-template` (UPDATED)
- **AMI**: `ami-049f5a67a049b393d` (NEW)

Other infrastructure remains unaffected:
- Different ASGs/Launch Templates NOT modified
- Other services NOT affected
- Other tools infrastructure unchanged

## Verification

To verify everything is working:

```bash
# Check ASG is using correct template and AMI
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names url-tracker-proxy-asg \
  --output json | jq '.AutoScalingGroups[0].LaunchTemplate'

# Check launch template version points to new AMI
aws ec2 describe-launch-template-versions \
  --launch-template-id lt-0d0c3ed5e9a25c190 \
  --output json | jq '.LaunchTemplateVersions | map({CreateTime, ImageId: .LaunchTemplateData.ImageId}) | sort_by(.CreateTime) | reverse | .[0]'

# Test current instances still respond
for ip in 13.222.100.70 44.215.112.238 100.29.190.60 44.200.222.95 100.53.41.66 3.239.71.2; do
  echo -n "$ip: "
  curl -s "http://$ip:3000/click/health" | jq -r '.status' || echo "error"
done
```

## Next Steps

1. **Test Scale-Up** (Optional):
   - Scale ASG to 7 instances to test new AMI auto-launch
   - Verify new instance has google-ads-click.js running
   - Check it responds to /click/health endpoint

2. **Monitor New Instances**:
   - When new instances launch, verify they include latest code
   - Check PM2 process status
   - Verify database connections working

3. **Archive Old AMI** (Optional):
   - After confirming new AMI stable for 1+ week
   - Can deregister old AMI `ami-0d37efc2909a09424`
   - Saves on AMI storage costs

## Timeline

- **15:37:54**: Previous launch template version created
- **16:41:35**: New launch template version created with new AMI
- **16:41:35**: ASG updated to use new template version
- **Current**: 6 instances running on old AMI (unchanged)
- **Future**: Any new instances will use new AMI

## Infrastructure Diagram

```
┌─────────────────────────────────────────────┐
│   Auto Scaling Group                        │
│   url-tracker-proxy-asg                     │
│   Min: 6, Max: 15, Desired: 6               │
│                                             │
│  Launch Template: url-tracker-proxy-template
│  Version: $Latest                           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Current Instances (Old AMI)         │   │
│  │ Count: 6                            │   │
│  │ AMI: ami-0d37efc2909a09424          │   │
│  │ Status: Running (No changes)        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Future Instances (New AMI)          │   │
│  │ AMI: ami-049f5a67a049b393d (NEW)   │   │
│  │ Status: Ready for launch            │   │
│  │ Contents: Latest google-ads-click.js
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Technical Details

### AMI Specifications
- **Created from**: Instance i-0a8553a86f733cba2
- **Creation method**: No-reboot snapshot
- **Size**: (Determined by instance volume size)
- **Region**: us-east-1 (same as current instances)
- **Includes**:
  - Base OS with all packages
  - Node.js runtime
  - PM2 process manager
  - google-ads-click.js route
  - All dependencies and configurations
  - Environment setup

### Launch Template Specifications
- **Type**: Auto Scaling compatible
- **Version Control**: Automatic (incremental versions)
- **Pricing**: No additional cost (template itself)
- **Instances from template**: Standard on-demand pricing
- **Update mechanism**: Create new version, no template replacement

## Compliance Notes

✅ **Isolated to Google Ads Infrastructure**: Only `url-tracker-proxy-asg` and related resources modified
✅ **No current instance changes**: Existing 6 instances unaffected
✅ **Future-proof**: All new instances will auto-include latest code
✅ **Rollback capability**: Can revert to previous AMI/version if needed
✅ **Cost optimized**: No extra charges for template/AMI storage

## Success Criteria Met

- [x] New AMI created from latest instance
- [x] New launch template version created
- [x] ASG updated to use new template
- [x] Confirmed new template points to new AMI
- [x] Verified Google Ads ASG is isolated (not affecting other tools)
- [x] Current instances remain stable
- [x] Future instances will launch with latest code
