# BrightData IP Whitelisting Instructions

## ✅ NAT Gateway Setup Complete

**NAT Gateway ID:** `nat-06d8101f2c329502b`  
**Elastic IP:** `3.226.2.45`  
**Status:** Active and routing all EC2 traffic

---

## 🎯 CRITICAL: Whitelist IP in BrightData

All 3 EC2 instances (and future instances) now share the same outbound IP address: **3.226.2.45**

You MUST whitelist this IP in BrightData for the proxy to work.

---

## 📋 Step-by-Step Instructions

### 1. Go to BrightData Dashboard
Open: https://brightdata.com/cp/zones

### 2. Select Your Zone
- Find and click on zone: **`testing_softality_1`**

### 3. Navigate to IP Whitelist Settings
- Click on "Zone Settings" tab
- Find "IP Whitelist" or "Access Control" section

### 4. Add the Elastic IP
- Click "Add IP" or similar button
- Enter IP address: **`3.226.2.45`**
- Save changes

### 5. Verify (Optional)
- You should see `3.226.2.45` in the whitelist
- It may take 1-2 minutes to propagate

---

## 🧪 Testing After Whitelisting

### Option A: Run Test Script on EC2

SSH to any instance:
```bash
ssh ubuntu@44.193.24.197
# or
ssh ubuntu@3.215.185.91
# or  
ssh ubuntu@18.209.212.159
```

Download and run test script:
```bash
cd /home/ubuntu
curl -O https://your-deployment-url/test-brightdata-after-whitelist.sh
chmod +x test-brightdata-after-whitelist.sh
./test-brightdata-after-whitelist.sh
```

Or manually copy the script from `proxy-service/scripts/test-brightdata-after-whitelist.sh`

### Option B: Manual Test Commands

On any EC2 instance, run:

**Test 1: Check outbound IP**
```bash
curl https://api.ipify.org
# Should return: 3.226.2.45
```

**Test 2: Test BrightData proxy (US)**
```bash
curl --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-us:sugfiq4h5s73" \
  "https://ipapi.co/json/"
# Should return: 200 OK with US IP data
```

**Test 3: Test BrightData proxy (India)**
```bash
curl --proxy brd.superproxy.io:33335 \
  --proxy-user "brd-customer-hl_a908b07a-zone-testing_softality_1-country-in:sugfiq4h5s73" \
  "https://ipapi.co/json/"
# Should return: 200 OK with India IP data
```

---

## ✅ Expected Results

### Before Whitelisting:
- `curl` returns: **HTTP 407** (Proxy Authentication Required)
- Error message: "The IP address... is not whitelisted"

### After Whitelisting:
- `curl` returns: **HTTP 200** (OK)
- Response contains JSON with country data
- US test shows: `"country": "US"`
- India test shows: `"country": "IN"`

---

## 🚀 Benefits of This Setup

### One-Time Configuration:
- ✅ Whitelist **1 IP** instead of 3+
- ✅ Auto-scaling ready (new instances automatically work)
- ✅ No manual work for future deployments

### Current Status:
- **3 active instances** → All use `3.226.2.45`
- **Auto-scaling adds 5 more** → All use `3.226.2.45`
- **Replace instances** → All use `3.226.2.45`
- **Launch 100 instances** → All use `3.226.2.45`

**You never need to update BrightData whitelist again!** 🎉

---

## 🔄 Rollback (If Needed)

If something goes wrong, restore the old Internet Gateway routing:

```bash
# Get IGW ID from backup
IGW_ID=$(cat /tmp/original-igw-id.txt)

# Remove NAT Gateway route
aws ec2 delete-route \
  --route-table-id rtb-0390539715d28db32 \
  --destination-cidr-block 0.0.0.0/0

# Restore IGW route
aws ec2 create-route \
  --route-table-id rtb-0390539715d28db32 \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID
```

Then instances will use their individual public IPs again.

---

## 📊 Summary

| Item | Value |
|------|-------|
| **NAT Gateway ID** | nat-06d8101f2c329502b |
| **Elastic IP** | 3.226.2.45 |
| **VPC** | vpc-0526c9da5a05585c5 |
| **Subnet** | subnet-055bffceee73f3522 (us-east-1a) |
| **Route Table** | rtb-0390539715d28db32 (main) |
| **BrightData Zone** | testing_softality_1 |
| **IP to Whitelist** | **3.226.2.45** |

---

## ❓ Troubleshooting

### Still getting 407 after whitelisting?
- Wait 1-2 minutes for BrightData to propagate
- Verify IP is in whitelist: https://brightdata.com/cp/zones
- Check you whitelisted correct zone: `testing_softality_1`
- Verify outbound IP on EC2: `curl https://api.ipify.org` (should be 3.226.2.45)

### Different outbound IP?
- NAT Gateway may not be routing correctly
- Check route table: `aws ec2 describe-route-tables --route-table-ids rtb-0390539715d28db32`
- Should see: `0.0.0.0/0 → nat-06d8101f2c329502b`

### Internet not working on EC2?
- NAT Gateway must be in **public subnet** with Internet Gateway route
- Check NAT Gateway status: `aws ec2 describe-nat-gateways --nat-gateway-ids nat-06d8101f2c329502b`
- Should show: `State: available`

---

## 📞 Support

If issues persist after following all steps, check:
1. NAT Gateway is in `available` state
2. Route table shows NAT Gateway route
3. EC2 security groups allow outbound traffic
4. BrightData credentials are correct
5. IP `3.226.2.45` is in BrightData whitelist
