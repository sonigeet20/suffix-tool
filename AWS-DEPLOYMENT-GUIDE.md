# AWS EC2 Deployment Guide - Complete Setup

## What Needs to Be on AWS

Your AWS EC2 server needs to handle **both tracer modes**:

1. **HTTP-Only Tracer** (Fast - existing code needs updates)
2. **Browser Tracer** (Complex - needs Playwright/Puppeteer)

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                     AWS EC2 Instance                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             Node.js Express Server                    │ │
│  │                   (Port 3000)                         │ │
│  └───────────────────┬──────────────────────────────────┘ │
│                      │                                     │
│       ┌──────────────┴──────────────┐                    │
│       │                              │                     │
│  ┌────▼─────┐                 ┌─────▼────┐               │
│  │HTTP-Only │                 │ Browser  │               │
│  │  Tracer  │                 │  Tracer  │               │
│  │          │                 │          │               │
│  │ • fetch  │                 │• Playwright│              │
│  │ • axios  │                 │• Chromium │              │
│  │ • cheerio│                 │• Resource │              │
│  │          │                 │  Blocking │              │
│  └────┬─────┘                 └─────┬────┘               │
│       │                              │                     │
│       └──────────────┬───────────────┘                    │
│                      │                                     │
│              ┌───────▼────────┐                           │
│              │  Luna Proxy    │                           │
│              │  IP: From Pool │                           │
│              └────────────────┘                           │
└────────────────────────────────────────────────────────────┘
```

## Required Software Stack

### 1. Base System
```bash
- Ubuntu 22.04 LTS (recommended)
- Node.js 18+ or 20+
- npm 9+
- Git
```

### 2. Node.js Dependencies
```json
{
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "cheerio": "^1.0.0-rc.12",
  "playwright": "^1.40.0",
  "dotenv": "^16.3.1",
  "cors": "^2.8.5"
}
```

### 3. System Libraries (for Playwright)
```bash
- Chromium browser
- Required system fonts
- SSL certificates
```

## Complete Server Code

### File Structure
```
/home/ubuntu/proxy-service/
├── server.js                 # Main Express server
├── tracers/
│   ├── http-only.js         # HTTP-Only tracer
│   └── browser.js           # Browser tracer
├── utils/
│   ├── proxy.js             # Proxy configuration
│   └── param-extractor.js   # Parameter extraction
├── package.json
├── .env
└── ecosystem.config.js      # PM2 config
```

### server.js (Main Server)

```javascript
const express = require('express');
const cors = require('cors');
const httpOnlyTracer = require('./tracers/http-only');
const browserTracer = require('./tracers/browser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    tracers: {
      http_only: 'available',
      browser: 'available'
    }
  });
});

// Main trace endpoint
app.post('/trace', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      url,
      mode = 'http_only',
      proxy_ip,
      proxy_port = '7000',
      target_country = 'us',
      referrer,
      max_redirects = 20,
      timeout_ms = 60000,
      user_agent,
      block_resources = true,
      extract_only = true
    } = req.body;

    console.log(`[TRACE] Mode: ${mode}, URL: ${url}, Country: ${target_country}`);

    // Build Luna proxy URL
    const lunaUsername = process.env.LUNA_USERNAME;
    const lunaPassword = process.env.LUNA_PASSWORD;

    let proxyConfig = null;
    if (proxy_ip && lunaUsername && lunaPassword) {
      proxyConfig = {
        server: `http://${proxy_ip}:${proxy_port}`,
        username: lunaUsername,
        password: lunaPassword
      };
    }

    let result;

    if (mode === 'browser') {
      // Use Browser Tracer
      result = await browserTracer.trace({
        url,
        proxyConfig,
        targetCountry: target_country,
        referrer,
        timeoutMs: timeout_ms,
        userAgent: user_agent,
        blockResources: block_resources,
        extractOnly: extract_only
      });
    } else {
      // Use HTTP-Only Tracer (default)
      result = await httpOnlyTracer.trace({
        url,
        proxyConfig,
        targetCountry: target_country,
        referrer,
        maxRedirects: max_redirects,
        timeoutMs: timeout_ms,
        userAgent: user_agent
      });
    }

    const totalTime = Date.now() - startTime;

    res.json({
      ...result,
      total_timing_ms: totalTime,
      mode_used: mode
    });

  } catch (error) {
    console.error('[ERROR] Trace failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      total_timing_ms: Date.now() - startTime
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Proxy Service running on port ${PORT}`);
  console.log(`✅ HTTP-Only tracer: enabled`);
  console.log(`✅ Browser tracer: enabled`);
});
```

### tracers/http-only.js

```javascript
const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function trace(options) {
  const {
    url,
    proxyConfig,
    targetCountry,
    referrer,
    maxRedirects = 20,
    timeoutMs = 60000,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  } = options;

  const chain = [];
  let currentUrl = url;
  let redirectCount = 0;
  const visitedUrls = new Set();

  // Configure axios with proxy
  const axiosConfig = {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    timeout: timeoutMs,
    maxRedirects: 0, // Handle redirects manually
    validateStatus: () => true, // Accept all status codes
  };

  if (referrer) {
    axiosConfig.headers['Referer'] = referrer;
  }

  if (proxyConfig) {
    const proxyUrl = `${proxyConfig.server}`;
    const proxyAuth = `${proxyConfig.username}:${proxyConfig.password}`;
    axiosConfig.proxy = false;
    axiosConfig.httpsAgent = new HttpsProxyAgent(`http://${proxyAuth}@${proxyUrl.replace('http://', '')}`);
    axiosConfig.httpAgent = new HttpsProxyAgent(`http://${proxyAuth}@${proxyUrl.replace('http://', '')}`);
  }

  while (redirectCount < maxRedirects) {
    if (visitedUrls.has(currentUrl)) {
      chain.push({
        url: currentUrl,
        status: 0,
        redirect_type: 'error',
        method: 'loop_detected',
        error: 'Redirect loop detected'
      });
      break;
    }

    visitedUrls.add(currentUrl);
    const stepStart = Date.now();

    try {
      const response = await axios.get(currentUrl, axiosConfig);
      const stepTime = Date.now() - stepStart;
      const status = response.status;
      const headers = response.headers;

      // Extract params from current URL
      const urlObj = new URL(currentUrl);
      const params = Object.fromEntries(urlObj.searchParams);

      // HTTP redirect (301, 302, 307, 308)
      if (status >= 300 && status < 400 && headers.location) {
        const nextUrl = new URL(headers.location, currentUrl).toString();

        chain.push({
          url: currentUrl,
          status,
          redirect_type: 'http',
          method: 'location_header',
          params,
          timing_ms: stepTime
        });

        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      // Success response - check for meta refresh or JS redirects
      if (status >= 200 && status < 300) {
        const html = response.data;
        const $ = cheerio.load(html);

        // Check for meta refresh
        const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
        if (metaRefresh) {
          const match = metaRefresh.match(/url=(.+)/i);
          if (match) {
            const nextUrl = new URL(match[1].trim(), currentUrl).toString();

            chain.push({
              url: currentUrl,
              status,
              redirect_type: 'meta',
              method: 'meta_refresh',
              params,
              html_snippet: metaRefresh.substring(0, 200),
              timing_ms: stepTime
            });

            currentUrl = nextUrl;
            redirectCount++;
            continue;
          }
        }

        // Check for JavaScript redirects
        const jsRedirectPatterns = [
          /window\.location\.href\s*=\s*["']([^"']+)["']/i,
          /window\.location\.replace\(["']([^"']+)["']\)/i,
          /window\.location\s*=\s*["']([^"']+)["']/i,
          /location\.href\s*=\s*["']([^"']+)["']/i,
          /location\.replace\(["']([^"']+)["']\)/i
        ];

        for (const pattern of jsRedirectPatterns) {
          const match = html.match(pattern);
          if (match) {
            try {
              const nextUrl = new URL(match[1].trim(), currentUrl).toString();

              chain.push({
                url: currentUrl,
                status,
                redirect_type: 'javascript',
                method: 'js_redirect',
                params,
                html_snippet: match[0].substring(0, 200),
                timing_ms: stepTime
              });

              currentUrl = nextUrl;
              redirectCount++;
              break;
            } catch (e) {
              // Invalid URL in JS redirect
            }
          }
        }

        // If we found a JS redirect, continue the loop
        if (chain[chain.length - 1]?.redirect_type === 'javascript') {
          continue;
        }

        // No redirects found - this is final destination
        chain.push({
          url: currentUrl,
          status,
          redirect_type: 'final',
          method: 'final_destination',
          params,
          timing_ms: stepTime
        });
        break;
      }

      // Other status codes - error
      chain.push({
        url: currentUrl,
        status,
        redirect_type: 'error',
        method: 'http',
        params,
        error: `HTTP ${status}`,
        timing_ms: stepTime
      });
      break;

    } catch (error) {
      chain.push({
        url: currentUrl,
        status: 0,
        redirect_type: 'error',
        method: 'fetch_error',
        error: error.message,
        timing_ms: Date.now() - stepStart
      });
      break;
    }
  }

  // Extract final parameters
  const finalUrl = chain[chain.length - 1]?.url || url;
  const finalUrlObj = new URL(finalUrl);
  const extractedParams = Object.fromEntries(finalUrlObj.searchParams);

  // Calculate bandwidth (estimate)
  const bandwidthKb = Math.round(JSON.stringify(chain).length / 1024);

  return {
    success: chain.length > 0,
    chain,
    final_url: finalUrl,
    extracted_params: extractedParams,
    total_steps: chain.length,
    bandwidth_kb: bandwidthKb
  };
}

module.exports = { trace };
```

### tracers/browser.js

```javascript
const { chromium } = require('playwright');

async function trace(options) {
  const {
    url,
    proxyConfig,
    targetCountry,
    referrer,
    timeoutMs = 60000,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    blockResources = true,
    extractOnly = true
  } = options;

  const chain = [];
  let browser = null;
  let context = null;
  let page = null;

  try {
    const startTime = Date.now();

    // Launch browser with proxy
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    };

    if (proxyConfig) {
      launchOptions.proxy = {
        server: proxyConfig.server,
        username: proxyConfig.username,
        password: proxyConfig.password
      };
    }

    browser = await chromium.launch(launchOptions);

    // Create context with user agent
    context = await browser.newContext({
      userAgent: userAgent,
      extraHTTPHeaders: referrer ? { 'Referer': referrer } : {}
    });

    page = await context.newPage();

    // Block resources if enabled
    if (blockResources) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const blockedTypes = ['image', 'stylesheet', 'font', 'media'];

        // Also block analytics
        const url = route.request().url();
        const blockedDomains = [
          'google-analytics.com',
          'googletagmanager.com',
          'facebook.com/tr',
          'doubleclick.net',
          'ads',
          'analytics'
        ];

        const shouldBlock = blockedTypes.includes(resourceType) ||
                          blockedDomains.some(domain => url.includes(domain));

        if (shouldBlock) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // Track navigation events
    let navigationCount = 0;
    const urls = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const frameUrl = frame.url();
        urls.push(frameUrl);
        navigationCount++;

        chain.push({
          url: frameUrl,
          status: 200,
          redirect_type: navigationCount === 1 ? 'initial' : 'navigation',
          method: 'browser_navigation',
          timing_ms: Date.now() - startTime
        });
      }
    });

    // Navigate and wait
    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: extractOnly ? 'domcontentloaded' : 'networkidle'
    });

    // Wait a bit for any delayed redirects
    await page.waitForTimeout(2000);

    // Get final URL
    const finalUrl = page.url();

    // Extract parameters
    const finalUrlObj = new URL(finalUrl);
    const extractedParams = Object.fromEntries(finalUrlObj.searchParams);

    // Estimate bandwidth (browser mode uses more)
    const bandwidthKb = blockResources ? 150 : 1500; // Rough estimate

    return {
      success: true,
      chain,
      final_url: finalUrl,
      extracted_params: extractedParams,
      total_steps: chain.length,
      bandwidth_kb: bandwidthKb,
      timing_ms: Date.now() - startTime
    };

  } catch (error) {
    chain.push({
      url: url,
      status: 0,
      redirect_type: 'error',
      method: 'browser_error',
      error: error.message
    });

    return {
      success: false,
      chain,
      final_url: url,
      extracted_params: {},
      total_steps: chain.length,
      error: error.message
    };

  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { trace };
```

### package.json

```json
{
  "name": "proxy-service",
  "version": "2.0.0",
  "description": "Intelligent proxy service with HTTP-only and browser tracers",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop proxy-service",
    "pm2:restart": "pm2 restart proxy-service",
    "pm2:logs": "pm2 logs proxy-service"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "playwright": "^1.40.0",
    "https-proxy-agent": "^7.0.2",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### .env

```bash
PORT=3000
LUNA_USERNAME=your-luna-username
LUNA_PASSWORD=your-luna-password
NODE_ENV=production
```

### ecosystem.config.js (PM2 Config)

```javascript
module.exports = {
  apps: [{
    name: 'proxy-service',
    script: 'server.js',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

## Installation Steps

### 1. Connect to EC2

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### 2. Install Node.js

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be v20.x
npm --version   # Should be 10.x
```

### 3. Install System Dependencies (for Playwright)

```bash
# Install Playwright system dependencies
sudo npx playwright install-deps chromium

# Or manually:
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2
```

### 4. Create Project Directory

```bash
cd /home/ubuntu
mkdir proxy-service
cd proxy-service
```

### 5. Upload/Create Files

**Option A: Upload via SCP**
```bash
# From your local machine
scp -i your-key.pem -r proxy-service/* ubuntu@your-ec2-ip:/home/ubuntu/proxy-service/
```

**Option B: Create files manually**
```bash
# Create directory structure
mkdir -p tracers utils logs

# Create each file using nano or vim
nano server.js
nano tracers/http-only.js
nano tracers/browser.js
nano package.json
nano .env
nano ecosystem.config.js
```

### 6. Install Dependencies

```bash
cd /home/ubuntu/proxy-service
npm install

# Install Playwright browsers
npx playwright install chromium
```

### 7. Configure Environment

```bash
nano .env

# Add your Luna credentials:
LUNA_USERNAME=your-username
LUNA_PASSWORD=your-password
PORT=3000
```

### 8. Test Locally

```bash
# Test HTTP-only tracer
node server.js &
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bit.ly/3xYz123","mode":"http_only"}'

# Test browser tracer
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"browser"}'

# Stop test
pkill node
```

### 9. Install PM2

```bash
sudo npm install -g pm2

# Start service
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Enable auto-start on reboot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 10. Configure Security Group

In AWS Console:
```
Security Group Rules:
- Port 3000: Your Supabase Functions IP ranges
- Port 22: Your admin IP (SSH)
- Port 443: Outbound (for proxies)
```

### 11. Verify Installation

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs proxy-service

# Test from external
curl http://your-ec2-ip:3000/health
```

## Testing Both Tracers

### Test HTTP-Only Mode

```bash
curl -X POST http://your-ec2-ip:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://bit.ly/3abc123",
    "mode": "http_only",
    "proxy_ip": "185.199.228.15",
    "target_country": "us",
    "max_redirects": 20,
    "timeout_ms": 10000
  }'
```

Expected response:
```json
{
  "success": true,
  "mode_used": "http_only",
  "chain": [...],
  "final_url": "https://final-destination.com?param=value",
  "extracted_params": {"param": "value"},
  "total_timing_ms": 2350,
  "bandwidth_kb": 28
}
```

### Test Browser Mode

```bash
curl -X POST http://your-ec2-ip:3000/trace \
  -H "Content-Type": "application/json" \
  -d '{
    "url": "https://modern-tracker.com/click",
    "mode": "browser",
    "proxy_ip": "185.199.228.15",
    "target_country": "us",
    "block_resources": true,
    "extract_only": true,
    "timeout_ms": 30000
  }'
```

Expected response:
```json
{
  "success": true,
  "mode_used": "browser",
  "chain": [...],
  "final_url": "https://final.com?clickid=generated123",
  "extracted_params": {"clickid": "generated123"},
  "total_timing_ms": 12480,
  "bandwidth_kb": 156
}
```

## Monitoring & Maintenance

### Check Service Health

```bash
# PM2 status
pm2 status

# View logs
pm2 logs proxy-service --lines 100

# Monitor resources
pm2 monit

# Restart if needed
pm2 restart proxy-service
```

### View Logs

```bash
# Real-time logs
tail -f logs/combined.log

# Error logs only
tail -f logs/err.log

# Search for errors
grep ERROR logs/combined.log
```

### Performance Monitoring

```bash
# CPU and memory
htop

# Network
sudo netstat -tuln | grep 3000

# Disk space
df -h
```

## Troubleshooting

### Issue: Playwright fails to launch

**Solution:**
```bash
# Reinstall Playwright dependencies
sudo npx playwright install-deps chromium

# Check if Chromium installed
ls ~/.cache/ms-playwright/
```

### Issue: Proxy connections fail

**Solution:**
```bash
# Test Luna proxy directly
curl -x http://username:password@185.199.228.15:7000 https://ipinfo.io/json

# Check credentials in .env
cat .env
```

### Issue: High memory usage

**Solution:**
```bash
# Reduce PM2 instances
pm2 scale proxy-service 1

# Or increase EC2 instance size (t3.medium → t3.large)
```

### Issue: Slow browser traces

**Solution:**
- Verify `block_resources: true` is enabled
- Verify `extract_only: true` is enabled
- Reduce timeout from 60s to 30s for faster failures

## Scaling Recommendations

### For 100 IPs in pool (low traffic)
```
EC2 Instance: t3.small (2 vCPU, 2 GB RAM)
Cost: ~$15/month
PM2 Instances: 2
```

### For 500 IPs in pool (medium traffic)
```
EC2 Instance: t3.medium (2 vCPU, 4 GB RAM)
Cost: ~$30/month
PM2 Instances: 4
```

### For 1000+ IPs (high traffic)
```
EC2 Instance: t3.large (2 vCPU, 8 GB RAM)
Cost: ~$60/month
PM2 Instances: 6-8
```

## Security Checklist

- [ ] Security Group: Only allow Supabase IPs on port 3000
- [ ] SSH: Only allow your admin IP on port 22
- [ ] Environment: Luna credentials in .env (not hardcoded)
- [ ] Updates: Auto-update enabled for security patches
- [ ] Monitoring: CloudWatch alarms for CPU/memory
- [ ] Backups: Regular snapshots of EC2 instance

## Updating the Service

```bash
# Pull latest code
cd /home/ubuntu/proxy-service
git pull  # Or upload new files

# Install dependencies
npm install

# Restart service
pm2 restart proxy-service

# Verify
curl http://localhost:3000/health
```

## Cost Estimate

### EC2 Instance (t3.medium)
```
Instance: $30/month
EBS Storage (20 GB): $2/month
Data Transfer: ~$5/month
─────────────────────────
Total: ~$37/month
```

### Luna Proxy Usage
```
HTTP-Only: 85% × 10k traces × 30 KB = 255 MB
Browser: 15% × 10k traces × 150 KB = 225 MB
─────────────────────────────────────────────
Total Bandwidth: 480 MB/month
Cost at $5/GB: $2.40/month
```

### Total Monthly Cost
```
EC2: $37
Luna: $2.40
─────────
Total: ~$40/month for 10,000 traces
```

## Next Steps

1. **✅ Deploy server code** to EC2
2. **✅ Install dependencies** (Node.js, Playwright)
3. **✅ Configure .env** with Luna credentials
4. **✅ Start with PM2** for auto-restart
5. **✅ Test both modes** (http_only and browser)
6. **✅ Update security groups** to allow Supabase
7. **📊 Monitor logs** for first day
8. **⚙️ Optimize** PM2 instances based on load

Your AWS server is now ready to handle both fast HTTP-only traces and complex browser traces!
