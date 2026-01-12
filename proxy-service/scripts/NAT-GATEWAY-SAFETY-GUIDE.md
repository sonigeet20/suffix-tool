# NAT Gateway Setup - Safety Guide

## ✅ Your Questions Answered

### Q1: Will we need to update the Load Balancer endpoint in the frontend?

**NO! Zero frontend changes needed.**

**Why?**
- **NAT Gateway affects OUTBOUND traffic only** (EC2 → Internet/BrightData)
- **Load Balancer handles INBOUND traffic** (User → EC2)
- These are completely separate paths

**Current Architecture:**
```
User → Supabase Edge Function → Load Balancer → EC2 Instances
                                                     ↓
                                          (outbound to BrightData)
```

**After NAT Gateway:**
```
User → Supabase Edge Function → Load Balancer → EC2 Instances
                                                     ↓
                                               NAT Gateway → BrightData
```

**Frontend continues to use:** Same Load Balancer DNS/endpoint (no changes)

---

### Q2: Will this affect the speed of our system?

**Minimal impact: ~1-5ms added latency**

**Performance Analysis:**

| Metric | Before NAT | After NAT | Impact |
|--------|-----------|-----------|--------|
| User → EC2 (inbound) | Direct via LB | Direct via LB | **No change** |
| EC2 → BrightData (outbound) | Direct | Via NAT Gateway | **+1-5ms** |
| BrightData → Target Site | Same | Same | **No change** |
| Total trace time | ~2-5 seconds | ~2-5 seconds | **Negligible** |

**Why minimal impact?**
- NAT Gateway is highly optimized AWS service
- Adds one network hop (~1-5ms)
- Your traces take 2-5 seconds → 1-5ms is 0.03-0.2% overhead
- Typical HTTP request through proxy: 500-1000ms
- NAT Gateway latency: ~1-5ms (0.1-1% of total)

**Real-world numbers:**
- Without NAT: EC2 → BrightData: ~50ms
- With NAT: EC2 → NAT → BrightData: ~51-55ms
- User won't notice the difference

---

## 🛡️ Safety Checklist

### Before Starting:

- [ ] **Backup current route tables**
  ```bash
  aws ec2 describe-route-tables --query 'RouteTables[*].[RouteTableId,VpcId]' > route-tables-backup.json
  ```

- [ ] **Document current EC2 network config**
  ```bash
  aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,SubnetId,PublicIpAddress]' > instances-backup.json
  ```

- [ ] **Verify Load Balancer is in PUBLIC subnet** (must have IGW route)

### What Won't Break:

✅ **Load Balancer** - Stays in public subnet, no changes
✅ **Inbound traffic** - User requests continue through LB
✅ **EC2 Security Groups** - Already allow outbound, no changes needed
✅ **Frontend code** - No endpoint changes
✅ **Supabase Edge Function** - Points to same LB endpoint
✅ **Existing connections** - Active sessions continue

### What Changes:

⚠️ **EC2 Outbound Traffic** - Now goes through NAT Gateway instead of direct IGW
⚠️ **Public IPs visible to external services** - Changes from individual EC2 IPs to single NAT Gateway IP
⚠️ **Route table for EC2 subnet** - Updated to route 0.0.0.0/0 → NAT Gateway

---

## 📋 Safe Implementation Steps

### Step 1: Verify Current Architecture

```bash
# Get VPC ID
aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0],IsDefault]'

# Get all subnets
aws ec2 describe-subnets --query 'Subnets[*].[SubnetId,Tags[?Key==`Name`].Value|[0],CidrBlock,MapPublicIpOnLaunch,AvailabilityZone]' --output table

# Get Load Balancer subnets
aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,VpcId,Scheme]'

# Get EC2 instance locations
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,SubnetId,PublicIpAddress,PrivateIpAddress]' --output table
```

**Expected Output:**
- VPC ID: `vpc-xxxxxx`
- Load Balancer: In PUBLIC subnet(s) with IGW route
- EC2 Instances: Likely in PUBLIC subnet(s) currently

### Step 2: Create NAT Gateway (Safe - No Impact Yet)

```bash
cd proxy-service/scripts

# Edit setup-nat-gateway.sh with your VPC/subnet IDs
nano setup-nat-gateway.sh

# Run setup
./setup-nat-gateway.sh
```

**What happens:**
- ✅ Creates Elastic IP (no impact on existing resources)
- ✅ Creates NAT Gateway in public subnet (no impact yet)
- ✅ Waits for NAT Gateway to be available
- ⚠️ Updates route table (THIS is where change happens)

### Step 3: Route Table Decision

**Option A: Gradual Rollout (Recommended)**

Create NEW private subnet for testing:
```bash
# Create test private subnet
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.10.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=test-private-subnet}]'

# Update its route table to use NAT Gateway
aws ec2 create-route \
  --route-table-id rtb-test \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-xxxxx

# Launch ONE test EC2 instance in this subnet
# Verify it works
# Then migrate production instances
```

**Option B: Direct Update (Faster but requires coordination)**

Update existing EC2 subnet route table:
```bash
# CAUTION: This affects ALL instances in the subnet immediately

# Backup current route
aws ec2 describe-route-tables --route-table-ids rtb-xxxxx > backup-routes.json

# Update route
aws ec2 create-route \
  --route-table-id rtb-xxxxx \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-xxxxx
```

### Step 4: Verify Connectivity

```bash
# SSH to EC2 instance
ssh ubuntu@your-instance-ip

# Check outbound IP (should show NAT Gateway Elastic IP)
curl https://api.ipify.org
# Expected: 52.x.x.x (your Elastic IP)

# Test internet connectivity
curl -I https://www.google.com
# Expected: 200 OK

# Test BrightData (should get 407 - not whitelisted yet)
curl -I --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
  "https://ipapi.co/json/"
# Expected: 407 Proxy Authentication Required
# Error message should mention YOUR NAT Gateway IP (not instance IP)
```

### Step 5: Whitelist in BrightData

**Only after Step 4 confirms NAT Gateway IP is working:**

1. Go to https://brightdata.com/cp/zones
2. Select zone: `testing_softality_1`
3. Go to "Zone Settings" → "IP Whitelist"
4. Add your NAT Gateway Elastic IP: `52.x.x.x`
5. Save

### Step 6: Final Validation

```bash
# Test BrightData proxy (should work now)
curl --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
  "https://ipapi.co/json/"
# Expected: 200 OK with JSON response

# Test geo-targeting
curl --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-in:sugfiq4h5s73" \
  "https://ipapi.co/json/"
# Expected: 200 OK with India IP

# Test via your service
curl "http://your-load-balancer-dns/trace?url=https://example.com"
# Should work normally
```

---

## 🚨 Rollback Plan (If Something Goes Wrong)

### Quick Rollback:

```bash
# Restore original route (back to Internet Gateway)
aws ec2 create-route \
  --route-table-id rtb-xxxxx \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id igw-xxxxx \
  --replace

# Verify instances can reach internet
ssh ubuntu@instance-ip
curl https://api.ipify.org  # Should show instance IP again
```

### Complete Rollback:

```bash
# Delete NAT Gateway route
aws ec2 delete-route \
  --route-table-id rtb-xxxxx \
  --destination-cidr-block 0.0.0.0/0

# Restore IGW route
aws ec2 create-route \
  --route-table-id rtb-xxxxx \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id igw-xxxxx

# Delete NAT Gateway (stops charges)
aws ec2 delete-nat-gateway --nat-gateway-id nat-xxxxx

# Release Elastic IP (after NAT Gateway deleted)
aws ec2 release-address --allocation-id eipalloc-xxxxx
```

---

## 💡 Best Practices

### Timing:

**Best time to implement:** Low-traffic period or maintenance window

**Why?** While route table updates are instant, there's a brief moment where connections might retry. New connections work immediately.

### Testing:

1. **Test with ONE instance first**
2. **Verify end-to-end before migrating all instances**
3. **Keep one instance in public subnet as backup** (optional)

### Monitoring:

```bash
# Monitor NAT Gateway
aws ec2 describe-nat-gateways --nat-gateway-ids nat-xxxxx

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name BytesOutToSource \
  --dimensions Name=NatGatewayId,Value=nat-xxxxx \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

## 📊 Pre-Flight Checklist

Before running setup script:

- [ ] VPC ID identified: `vpc-_______`
- [ ] Public subnet ID (for NAT Gateway): `subnet-_______`
- [ ] Private subnet ID (for EC2s) or existing subnet: `subnet-_______`
- [ ] Route table ID for EC2 subnet: `rtb-_______`
- [ ] Load Balancer endpoint documented: `___________`
- [ ] Current EC2 IPs documented: `___________`
- [ ] BrightData zone confirmed: `testing_softality_1`
- [ ] Backup of route tables saved
- [ ] Low-traffic time scheduled (optional)

---

## 🎯 Expected Results

### Immediate Changes:
- ✅ EC2 outbound traffic uses NAT Gateway
- ✅ External services see single IP (Elastic IP)
- ✅ BrightData whitelist works for all instances

### No Changes:
- ✅ Load Balancer endpoint (frontend continues working)
- ✅ Inbound traffic path (same as before)
- ✅ EC2 security groups (no changes needed)
- ✅ Application code (no changes needed)

### Performance:
- ✅ Latency: +1-5ms (negligible for 2-5 second traces)
- ✅ Throughput: No degradation (NAT Gateway supports 45 Gbps)
- ✅ Reliability: AWS 99.99% SLA

---

## 🔗 Next Steps

1. **Run architecture verification** (Step 1 above)
2. **Share output** so I can customize setup-nat-gateway.sh with correct IDs
3. **I'll create safe rollout plan** based on your current setup
4. **We'll test with one instance** before migrating all

**Ready to proceed?** Share the output of the verification commands from Step 1.
