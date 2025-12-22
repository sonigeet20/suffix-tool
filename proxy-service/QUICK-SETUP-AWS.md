# Quick AWS Setup Guide

## 1. Upload Files to AWS

```bash
# SSH into your AWS instance
ssh -i YOUR_KEY.pem ubuntu@YOUR_AWS_IP

# Create directory
sudo mkdir -p /opt/url-tracker-proxy
sudo chown ubuntu:ubuntu /opt/url-tracker-proxy
cd /opt/url-tracker-proxy
```

## 2. Upload Required Files

From your local machine:
```bash
cd proxy-service/
scp -i YOUR_KEY.pem server.js ubuntu@YOUR_AWS_IP:/opt/url-tracker-proxy/
scp -i YOUR_KEY.pem package.json ubuntu@YOUR_AWS_IP:/opt/url-tracker-proxy/
```

## 3. Create .env File on AWS

SSH into AWS and create `.env`:
```bash
cd /opt/url-tracker-proxy
nano .env
```

Paste this and update with your credentials:
```bash
PORT=3000
NODE_ENV=production

# Luna Residential Proxy Credentials
LUNA_PROXY_HOST=customer-USERNAME-sessid-SESSION.proxy.lunaproxy.com
LUNA_PROXY_PORT=12233
LUNA_PROXY_USERNAME=your-username
LUNA_PROXY_PASSWORD=your-password

# API Key (generate a random secure key)
API_KEY=your-secure-random-api-key

# User Agent Configuration
USER_AGENT_POOL_SIZE=10000
USER_AGENT_MODE=dynamic
USER_AGENT_REFRESH_INTERVAL_HOURS=12
```

## 4. Install Dependencies

```bash
# Install Node.js if not installed
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install dependencies
npm install
```

## 5. Start Service

```bash
# Start with PM2
pm2 start server.js --name proxy-service

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

## 6. Configure Firewall

```bash
# Allow port 3000
sudo ufw allow 3000/tcp
```

## 7. Check Status

```bash
# View logs
pm2 logs proxy-service

# Check status
pm2 status

# Restart if needed
pm2 restart proxy-service
```

## Quick Update (After Initial Setup)

Just update server.js:
```bash
# From local machine
scp -i YOUR_KEY.pem server.js ubuntu@YOUR_AWS_IP:/opt/url-tracker-proxy/
ssh -i YOUR_KEY.pem ubuntu@YOUR_AWS_IP "cd /opt/url-tracker-proxy && pm2 restart proxy-service"
```

## Troubleshooting

```bash
# Check logs for errors
pm2 logs proxy-service --lines 50

# Check if service is running
pm2 status

# Restart service
pm2 restart proxy-service

# Test endpoint
curl http://localhost:3000/health
```

## What Your AWS Instance Needs:
- Ubuntu 20.04+ or Amazon Linux 2
- At least 2GB RAM (for Puppeteer)
- Node.js 18+
- PM2 process manager
- Ports 3000 and 443 open in security group
