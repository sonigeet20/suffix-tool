# AWS Deployment Guide for Luna Proxy Service

## Architecture Options

### Option 1: AWS EC2 (Simplest, Full Control)
- **Best for:** Getting started quickly, full control
- **Cost:** ~$20-50/month (t3.medium or t3.large)
- **Pros:** Simple, full control, easy debugging
- **Cons:** Manual scaling, you manage the server

### Option 2: AWS ECS with Fargate (Recommended)
- **Best for:** Production, auto-scaling
- **Cost:** ~$30-70/month (0.5 vCPU, 1GB RAM)
- **Pros:** Serverless containers, auto-scaling, no server management
- **Cons:** Slightly more complex setup

### Option 3: AWS App Runner (Easiest)
- **Best for:** Quick deployment with minimal configuration
- **Cost:** ~$25-60/month
- **Pros:** Simplest deployment, auto-scaling, auto-deploy from GitHub
- **Cons:** Less control, higher per-request cost

---

## Option 1: AWS EC2 Deployment (Step-by-Step)

### Step 1: Launch EC2 Instance

1. **Go to AWS Console → EC2 → Launch Instance**

2. **Configure Instance:**
   - Name: `luna-proxy-service`
   - AMI: Ubuntu Server 22.04 LTS
   - Instance type: `t3.medium` (2 vCPU, 4GB RAM) - minimum for Puppeteer
   - Key pair: Create new or select existing
   - Security group: Create new with these rules:
     - SSH (22) from your IP
     - Custom TCP (3000) from anywhere (0.0.0.0/0)
     - HTTPS (443) if using SSL
   - Storage: 20GB gp3

3. **Click "Launch Instance"**

### Step 2: Connect to EC2 Instance

```bash
# Download your .pem key and set permissions
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step 3: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Chrome dependencies
sudo apt install -y \
  wget gnupg ca-certificates fonts-liberation \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libgbm1 libgtk-3-0 \
  libnss3 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 xdg-utils

# Install PM2 for process management
sudo npm install -g pm2
```

### Step 4: Deploy Application

```bash
# Create application directory
mkdir -p /home/ubuntu/proxy-service
cd /home/ubuntu/proxy-service

# Upload files (from your local machine)
# Option A: Using SCP
scp -i your-key.pem -r proxy-service/* ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/proxy-service/

# Option B: Using Git (recommended)
git clone YOUR_REPO_URL .
```

### Step 5: Configure Environment

```bash
# Create .env file
nano .env
```

Paste your Luna credentials:
```env
PORT=3000
NODE_ENV=production
LUNA_PROXY_HOST=customer-USERNAME-sessid-SESSION.proxy.lunaproxy.com
LUNA_PROXY_PORT=12233
LUNA_PROXY_USERNAME=your-username
LUNA_PROXY_PASSWORD=your-password
```

Save with `Ctrl+X`, `Y`, `Enter`

### Step 6: Install and Start Service

```bash
# Install dependencies
npm install

# Start with PM2
pm2 start server.js --name proxy-service

# Configure PM2 to start on boot
pm2 startup
pm2 save

# Check status
pm2 status
pm2 logs proxy-service
```

### Step 7: Test the Service

```bash
# Test health endpoint
curl http://YOUR_EC2_PUBLIC_IP:3000/health

# Test IP endpoint (should show Luna proxy IP)
curl http://YOUR_EC2_PUBLIC_IP:3000/ip

# Test trace endpoint
curl -X POST http://YOUR_EC2_PUBLIC_IP:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Step 8: Optional - Setup HTTPS with Nginx

```bash
# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/proxy-service
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/proxy-service /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

---

## Option 2: AWS ECS with Fargate (Container Deployment)

### Step 1: Push Docker Image to ECR

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure

# Create ECR repository
aws ecr create-repository --repository-name luna-proxy-service --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build Docker image
cd proxy-service
docker build -t luna-proxy-service .

# Tag image
docker tag luna-proxy-service:latest YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/luna-proxy-service:latest

# Push to ECR
docker push YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/luna-proxy-service:latest
```

### Step 2: Create ECS Cluster

1. Go to **AWS Console → ECS → Clusters → Create Cluster**
2. Cluster name: `luna-proxy-cluster`
3. Infrastructure: AWS Fargate
4. Click **Create**

### Step 3: Create Task Definition

1. Go to **Task Definitions → Create new task definition**
2. Configure:
   - Family name: `luna-proxy-task`
   - Launch type: Fargate
   - Operating system: Linux/X86_64
   - CPU: 0.5 vCPU
   - Memory: 1 GB
   - Task execution role: ecsTaskExecutionRole (create if needed)

3. **Container definition:**
   - Name: `proxy-service`
   - Image URI: `YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/luna-proxy-service:latest`
   - Port mappings: 3000 (TCP)
   - Environment variables:
     - `LUNA_PROXY_HOST`: your-host
     - `LUNA_PROXY_PORT`: 12233
     - `LUNA_PROXY_USERNAME`: your-username
     - `LUNA_PROXY_PASSWORD`: your-password (use AWS Secrets Manager)

4. Click **Create**

### Step 4: Create Application Load Balancer

1. Go to **EC2 → Load Balancers → Create Load Balancer**
2. Type: Application Load Balancer
3. Name: `luna-proxy-alb`
4. Scheme: Internet-facing
5. Listeners: HTTP (80), HTTPS (443)
6. Availability Zones: Select at least 2
7. Security group: Allow HTTP/HTTPS from anywhere
8. Target group: Create new
   - Name: `luna-proxy-targets`
   - Target type: IP
   - Protocol: HTTP
   - Port: 3000
   - Health check path: `/health`

### Step 5: Create ECS Service

1. Go to **Clusters → luna-proxy-cluster → Services → Create**
2. Configure:
   - Launch type: Fargate
   - Task definition: `luna-proxy-task`
   - Service name: `luna-proxy-service`
   - Number of tasks: 2 (for redundancy)
   - Deployment type: Rolling update
   - Load balancer: Use existing ALB
   - Target group: `luna-proxy-targets`
   - Auto-scaling: Enable with target tracking (CPU 70%)

3. Click **Create**

### Step 6: Configure DNS

1. Get ALB DNS name from Load Balancers page
2. Create CNAME record in your DNS provider:
   - Name: `proxy.yourdomain.com`
   - Value: ALB DNS name

---

## Option 3: AWS App Runner (Quickest)

### Step 1: Prepare Source

```bash
# Create apprunner.yaml in your repo
nano apprunner.yaml
```

```yaml
version: 1.0
runtime: nodejs18
build:
  commands:
    build:
      - npm install
      - npx puppeteer browsers install chrome
run:
  runtime-version: 18
  command: node server.js
  network:
    port: 3000
  env:
    - name: PORT
      value: "3000"
```

### Step 2: Deploy to App Runner

1. Go to **AWS Console → App Runner → Create service**
2. Source: Repository (connect GitHub) or Container registry
3. Select your repository
4. Build settings: Use apprunner.yaml
5. Service settings:
   - Name: `luna-proxy-service`
   - Port: 3000
   - CPU: 1 vCPU
   - Memory: 2 GB
6. Environment variables: Add Luna credentials
7. Click **Create & deploy**

---

## Update Supabase Edge Functions

After deploying, update your `trace-redirects` function to use the AWS proxy service:

```typescript
// In trace-redirects/index.ts

// Replace fetchThroughResidentialProxy with:
async function fetchThroughAWSProxy(
  url: string,
  timeout: number,
  userAgent: string
): Promise<{ chain: any[]; success: boolean; proxy_ip?: string } | null> {
  try {
    const AWS_PROXY_URL = Deno.env.get('AWS_PROXY_URL')!; // e.g., http://your-ec2-ip:3000

    const response = await fetch(`${AWS_PROXY_URL}/trace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        max_redirects: 20,
        timeout_ms: timeout,
        user_agent: userAgent,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      console.error(`AWS Proxy error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('AWS Proxy fetch error:', error);
    return null;
  }
}
```

---

## Cost Estimates

### EC2 (t3.medium)
- Instance: $30/month
- Storage: $2/month
- Data transfer: $5-10/month
- **Total: ~$37-42/month**

### ECS Fargate (0.5 vCPU, 1GB, 2 tasks)
- Compute: $25/month
- Storage: $1/month
- ALB: $16/month
- Data transfer: $5-10/month
- **Total: ~$47-52/month**

### App Runner (1 vCPU, 2GB)
- Compute: $25/month (provisioned)
- Data transfer: $5-10/month
- **Total: ~$30-35/month**

---

## Monitoring & Maintenance

### CloudWatch Setup

```bash
# EC2: Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

### PM2 Monitoring (EC2)

```bash
# View logs
pm2 logs proxy-service

# Monitor resources
pm2 monit

# Restart service
pm2 restart proxy-service

# Update and restart
git pull
npm install
pm2 restart proxy-service
```

### Auto-updates (EC2)

```bash
# Create update script
nano /home/ubuntu/update-service.sh
```

```bash
#!/bin/bash
cd /home/ubuntu/proxy-service
git pull
npm install
pm2 restart proxy-service
```

```bash
chmod +x /home/ubuntu/update-service.sh

# Schedule with cron (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/ubuntu/update-service.sh >> /home/ubuntu/update.log 2>&1
```

---

## Security Best Practices

1. **Use AWS Secrets Manager** for Luna credentials
2. **Enable CloudWatch logs** for debugging
3. **Set up CloudWatch alarms** for high CPU/memory
4. **Use Security Groups** to restrict access
5. **Enable HTTPS** with SSL certificate
6. **Regular updates** with unattended-upgrades (EC2)
7. **Backup strategy** using AWS Backup

---

## Troubleshooting

### Puppeteer fails to launch
```bash
# Check Chrome installation
google-chrome --version

# Reinstall Puppeteer
npm rebuild puppeteer
```

### High memory usage
```bash
# Increase swap (EC2)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Proxy connection fails
```bash
# Test proxy directly
curl -x http://USERNAME:PASSWORD@PROXY_HOST:PORT https://api.ipify.org
```

---

## Next Steps

1. Choose deployment option (EC2 recommended for getting started)
2. Get Luna Residential Proxy credentials
3. Deploy the service
4. Test endpoints
5. Update Supabase edge functions to use AWS proxy URL
6. Monitor and optimize
