# Manual Update Steps for Browser Navigation Fix

The server.js file has been fixed locally. Follow these steps to update your EC2 instance:

## Option 1: Direct SCP Upload (Recommended)

```bash
# From your local machine, in the proxy-service directory:
scp server.js ec2-user@YOUR_EC2_IP:/home/ec2-user/proxy-service/server.js

# Then SSH and restart:
ssh ec2-user@YOUR_EC2_IP
cd /home/ec2-user/proxy-service
pm2 restart proxy-service
pm2 logs proxy-service --lines 20
```

## Option 2: Via Git

```bash
# SSH to EC2:
ssh ec2-user@YOUR_EC2_IP
cd /home/ec2-user/proxy-service

# Backup current file:
cp server.js server.js.backup

# Pull updates (if using git):
git pull

# Or download the fixed file directly
# (Use this if you can paste the file content)

# Restart:
pm2 restart proxy-service
pm2 logs
```

## Option 3: Check File Was Updated

```bash
# On EC2, verify line 807 has try-catch:
ssh ec2-user@YOUR_EC2_IP "sed -n '805,820p' /home/ec2-user/proxy-service/server.js"

# You should see:
#   let metaRefresh = null;
#   try {
#     metaRefresh = await page.evaluate(() => {
```

## Verify Fix Is Working

After restart, you should see:
- ✅ No more "Execution context was destroyed" errors
- ✅ Or warning logs like "⚠️ Could not check meta refresh: page navigated"
- ✅ Traces completing successfully

The fix wraps three `page.evaluate()` calls in try-catch blocks at:
- Line 807: Meta refresh detection in browser trace
- Line 1141: URL decoding in cloaking detection
- Line 1182: Meta refresh in cloaking detection
