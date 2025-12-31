# Step-by-Step Deployment Guide

## Step 1: Get Luna Residential Proxy Credentials

You currently have a Luna API token, but we need **Luna Residential Proxy** credentials.

### Action:
1. Go to https://www.lunaproxy.com and log in
2. Navigate to **Products** → **Residential Proxies** (NOT the API section)
3. Look for proxy connection details that include:
   - Proxy Host (format: `customer-xxxxx-cc-us.lunaproxy.net`)
   - Proxy Port (usually `12233`)
   - Username
   - Password

### What to do:
- If you see these credentials → Copy them and move to Step 2
- If you don't have this product → You may need to purchase Luna Residential Proxies separately from the API
- If unsure → Take a screenshot of what you see in the dashboard

---

## Step 2: Deploy EC2 Instance

### Action:
```bash
cd /tmp/cc-agent/61594306/project/proxy-service
./deploy-new-ec2.sh
```

### What happens:
- Script creates security group
- Launches new t3.medium instance
- Installs Node.js, Chrome, Puppeteer dependencies
- Takes 3-5 minutes

### Expected output:
```
Instance ID: i-xxxxxxxxx
Public IP: XX.XX.XX.XX
```

### Save this IP address - you'll need it!

---

## Step 3: Wait for Instance Initialization

The instance needs time to install all packages.

### Action:
Wait 5 minutes after the instance shows "running"

You can check status:
```bash
aws ec2 describe-instances --profile url-tracker \
  --instance-ids i-YOUR-INSTANCE-ID \
  --query 'Reservations[0].Instances[0].State.Name'
```

---

## Step 4: Upload Server Code

Replace `YOUR_IP` with your instance IP from Step 2.

### Action:
```bash
cd /tmp/cc-agent/61594306/project/proxy-service

# Upload server code
scp -i ~/.ssh/url-tracker.pem server.js ubuntu@YOUR_IP:/opt/luna-proxy/

# Upload package.json
scp -i ~/.ssh/url-tracker.pem package.json ubuntu@YOUR_IP:/opt/luna-proxy/
```

### Expected output:
```
server.js          100%   10KB   1.2MB/s   00:00
package.json       100%    1KB   500KB/s   00:00
```

---

## Step 5: Connect to Instance

### Action:
```bash
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_IP
```

You should see:
```
Welcome to Ubuntu 22.04.3 LTS
ubuntu@ip-xxx-xx-xx-xx:~$
```

---

## Step 6: Create Environment File

Now on the EC2 instance:

### Action:
```bash
cd /opt/luna-proxy
nano .env
```

### Paste this (replace with YOUR Luna credentials):
```env
PORT=3000
NODE_ENV=production

# Replace these with your Luna Residential Proxy credentials
LUNA_PROXY_HOST=customer-xxxxx-cc-us.lunaproxy.net
LUNA_PROXY_PORT=12233
LUNA_PROXY_USERNAME=your-username
LUNA_PROXY_PASSWORD=your-password
```

### Save:
- Press `Ctrl + X`
- Press `Y`
- Press `Enter`

---

## Step 7: Install Dependencies

Still on the EC2 instance:

### Action:
```bash
npm install
```

### What happens:
- Installs Express, Puppeteer, Axios, etc.
- Downloads Chrome binary
- Takes 2-3 minutes

### Expected output:
```
added 234 packages in 2m
```

---

## Step 8: Start the Service

### Action:
```bash
pm2 start server.js --name luna-proxy
pm2 save
pm2 startup
```

After the `pm2 startup` command, it will output a command. Copy and run it.

### Check status:
```bash
pm2 status
```

You should see:
```
│ luna-proxy │ 0 │ online │
```

---

## Step 9: Test the Service

Still on the EC2 instance:

### Test 1: Health check
```bash
curl http://localhost:3000/health
```

Expected:
```json
{"status":"healthy","uptime":123,"browser_initialized":false}
```

### Test 2: Check proxy IP
```bash
curl http://localhost:3000/ip
```

Expected:
```json
{"proxy_ip":"123.45.67.89","timestamp":"2025-12-18T..."}
```

This IP should be different from your EC2 IP (it's the Luna proxy IP).

### Test 3: Trace redirects
```bash
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://google.com"}'
```

Expected:
```json
{
  "success": true,
  "chain": [...],
  "proxy_used": true
}
```

---

## Step 10: Test from Your Local Machine

Exit the SSH session:
```bash
exit
```

Now from your local machine (replace YOUR_IP):

### Action:
```bash
# Health check
curl http://YOUR_IP:3000/health

# Proxy IP check
curl http://YOUR_IP:3000/ip

# Trace test
curl -X POST http://YOUR_IP:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://google.com","max_redirects":10}'
```

If all tests pass → Service is working!

---

## Step 11: Update Database with Proxy URL

From your local machine:

### Action:
The proxy service URL will be: `http://YOUR_IP:3000`

We need to update the Supabase edge function to use this URL.

---

## Troubleshooting

### If health check fails:
```bash
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_IP
pm2 logs luna-proxy
```

### If proxy IP test fails:
- Check Luna credentials in .env file
- Test Luna proxy directly:
```bash
curl -x http://USERNAME:PASSWORD@PROXY_HOST:12233 https://api.ipify.org
```

### If trace fails:
- Check browser initialization
- Check memory usage: `free -h`
- Add swap if needed (see QUICK-DEPLOY.md)

---

## Next Steps

Once the service is running and tested:
1. Update Supabase `trace-redirects` edge function
2. Update database settings with proxy URL
3. Test end-to-end redirect tracing from your app

---

## Cost Estimate

**Monthly costs:**
- EC2 t3.medium: ~$30/month
- Storage (20GB): ~$2/month
- Data transfer: ~$5-10/month
- **Total: ~$37-47/month**

Plus Luna Residential Proxy usage fees (pay per GB or requests).
