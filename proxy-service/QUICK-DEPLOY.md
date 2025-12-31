# Quick Deployment Guide - Luna Proxy Service

## Important: Luna Credentials Needed

The Puppeteer proxy service requires **Luna Residential Proxy** credentials (NOT the API token).

### What You Need:
```
LUNA_PROXY_HOST=customer-xxxxx-cc-us.lunaproxy.net
LUNA_PROXY_PORT=12233
LUNA_PROXY_USERNAME=your-username
LUNA_PROXY_PASSWORD=your-password
```

### Where to Get These:
1. Log in to [Luna Proxy Dashboard](https://www.lunaproxy.com)
2. Go to **Products** → **Residential Proxies**
3. Copy the proxy host, port, username, and password

**Note:** This is different from the Universal Scraping API token you currently have.

---

## Deployment Steps

### Step 1: Run the Deployment Script

```bash
cd proxy-service
chmod +x deploy-new-ec2.sh
./deploy-new-ec2.sh
```

This will:
- Create a security group
- Launch a new t3.medium EC2 instance
- Install Node.js, Chrome, and dependencies
- Output the instance IP address

**Wait 3-5 minutes** for the instance to finish initialization.

---

### Step 2: Upload Server Code

```bash
# From your local machine
cd proxy-service

# Upload server.js
scp -i ~/.ssh/url-tracker.pem server.js ubuntu@YOUR_INSTANCE_IP:/opt/luna-proxy/

# Upload package.json with correct dependencies
scp -i ~/.ssh/url-tracker.pem package.json ubuntu@YOUR_INSTANCE_IP:/opt/luna-proxy/
```

---

### Step 3: Connect and Configure

```bash
# SSH into instance
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_INSTANCE_IP

# Go to app directory
cd /opt/luna-proxy

# Create .env file
nano .env
```

Paste your Luna credentials:
```env
PORT=3000
NODE_ENV=production
LUNA_PROXY_HOST=customer-xxxxx-cc-us.lunaproxy.net
LUNA_PROXY_PORT=12233
LUNA_PROXY_USERNAME=your-username
LUNA_PROXY_PASSWORD=your-password
```

Save with `Ctrl+X`, `Y`, `Enter`

---

### Step 4: Install Dependencies and Start

```bash
# Install Node dependencies
npm install

# Start with PM2
pm2 start server.js --name luna-proxy

# Configure PM2 to start on boot
pm2 save
pm2 startup systemd -u root --hp /root
# (Run the command that PM2 outputs)

# Check status
pm2 status
pm2 logs luna-proxy
```

---

### Step 5: Test the Service

```bash
# Test health endpoint
curl http://YOUR_INSTANCE_IP:3000/health

# Test IP endpoint (should show Luna proxy IP)
curl http://YOUR_INSTANCE_IP:3000/ip

# Test trace endpoint
curl -X POST http://YOUR_INSTANCE_IP:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com", "max_redirects": 10, "timeout_ms": 30000}'
```

Expected output:
```json
{
  "success": true,
  "chain": [...],
  "total_steps": 3,
  "final_url": "https://google.com",
  "proxy_used": true,
  "proxy_type": "residential"
}
```

---

### Step 6: Update Supabase Edge Function

Once the service is running, update your `trace-redirects` edge function to use it:

The function will need to call:
```
http://YOUR_INSTANCE_IP:3000/trace
```

---

## Troubleshooting

### Browser fails to launch
```bash
# Check Chrome installation
google-chrome --version

# Reinstall if needed
sudo apt-get install --reinstall ./google-chrome-stable_current_amd64.deb
```

### Memory issues
```bash
# Check memory
free -h

# Add swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Proxy connection fails
```bash
# Test proxy directly
curl -x http://USERNAME:PASSWORD@PROXY_HOST:12233 https://api.ipify.org
```

### View logs
```bash
pm2 logs luna-proxy
pm2 monit
```

---

## Cost

**t3.medium EC2 instance:**
- Instance: ~$30/month
- Storage (20GB): ~$2/month
- Data transfer: ~$5-10/month
- **Total: ~$37-47/month**

Plus Luna Residential Proxy usage fees.

---

## Next Steps After Deployment

1. Get instance public IP
2. Update Supabase Edge Function with proxy URL
3. Test end-to-end redirect tracing
4. Monitor performance and adjust instance size if needed
