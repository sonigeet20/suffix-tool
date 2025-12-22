# Luna Proxy Service

A Node.js proxy service with Puppeteer for complete redirect tracing using Luna Residential Proxy credentials.

## Features

- Full redirect chain tracing (HTTP, Meta Refresh, JavaScript redirects)
- Puppeteer-based browser automation
- Luna Residential Proxy integration
- Realistic user agent rotation
- Parameter extraction from all redirect steps
- AWS-ready deployment

## Quick Start (Local Testing)

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your Luna credentials
nano .env

# Start server
npm start

# Or with auto-reload during development
npm run dev
```

## Docker Deployment

```bash
# Build image
docker build -t luna-proxy-service .

# Run container
docker run -d -p 3000:3000 \
  -e LUNA_PROXY_HOST=your-host \
  -e LUNA_PROXY_PORT=12233 \
  -e LUNA_PROXY_USERNAME=your-username \
  -e LUNA_PROXY_PASSWORD=your-password \
  luna-proxy-service

# Or use docker-compose
docker-compose up -d
```

## API Endpoints

### POST /trace
Trace URL redirects with Puppeteer

**Request:**
```json
{
  "url": "https://example.com",
  "max_redirects": 20,
  "timeout_ms": 30000,
  "user_agent": "Mozilla/5.0 ..."
}
```

**Response:**
```json
{
  "success": true,
  "chain": [
    {
      "url": "https://example.com",
      "status": 301,
      "redirect_type": "http",
      "method": "puppeteer",
      "headers": {...},
      "params": {...},
      "timing_ms": 123
    }
  ],
  "total_steps": 3,
  "final_url": "https://final-destination.com",
  "proxy_used": true,
  "proxy_type": "residential",
  "user_agent": "Mozilla/5.0 ..."
}
```

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "uptime": 12345,
  "timestamp": "2025-12-18T10:30:00.000Z",
  "browser_initialized": true
}
```

### GET /ip
Check current proxy IP

**Response:**
```json
{
  "proxy_ip": "123.45.67.89",
  "timestamp": "2025-12-18T10:30:00.000Z"
}
```

### GET /user-agent-stats
Get user agent rotation statistics

**Response:**
```json
{
  "mode": "dynamic",
  "totalRequests": 125000,
  "totalGenerated": 125000,
  "uniqueGenerated": 124987,
  "repetitionRate": "0.01%",
  "estimatedDailyCapacity": "Unlimited (generates fresh each time)",
  "deviceDistribution": {
    "desktop": "60%",
    "mobile": "30%",
    "tablet": "10%"
  }
}
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `LUNA_PROXY_HOST` | Luna proxy hostname | Yes | - |
| `LUNA_PROXY_PORT` | Luna proxy port | Yes | - |
| `LUNA_PROXY_USERNAME` | Luna proxy username | Yes | - |
| `LUNA_PROXY_PASSWORD` | Luna proxy password | Yes | - |
| `API_KEY` | API key for authentication | No | - |
| `USER_AGENT_MODE` | User agent mode (see below) | No | dynamic |
| `USER_AGENT_POOL_SIZE` | Pool size for pool/hybrid mode | No | 10000 |
| `USER_AGENT_REFRESH_INTERVAL_HOURS` | Pool refresh interval | No | 12 |

### User Agent System (High-Volume Ready)

The service includes an intelligent user agent rotation system designed for **500k+ daily requests**:

#### Operating Modes

1. **Dynamic Mode** (Recommended for 500k+ requests/day)
   - Generates a fresh user agent for every single request
   - Unlimited capacity with minimal repetition
   - No memory overhead from pre-generated pools
   - Typical repetition rate: <0.1%

   ```bash
   USER_AGENT_MODE=dynamic
   ```

2. **Pool Mode** (For predictable patterns)
   - Pre-generates a large pool of user agents (default: 10,000)
   - Sequential rotation through the pool
   - Refreshes automatically every 12 hours
   - Best for lower volume or when you want consistent patterns

   ```bash
   USER_AGENT_MODE=pool
   USER_AGENT_POOL_SIZE=10000
   USER_AGENT_REFRESH_INTERVAL_HOURS=12
   ```

3. **Hybrid Mode** (Best of both worlds)
   - Uses pre-generated pool as primary source
   - Falls back to dynamic generation when needed
   - Balances performance with variety

   ```bash
   USER_AGENT_MODE=hybrid
   USER_AGENT_POOL_SIZE=5000
   ```

#### Device Distribution

All modes generate realistic user agents with this distribution:
- **60% Desktop** (Windows, macOS, Linux with Chrome, Firefox, Safari, Edge)
- **30% Mobile** (iOS Safari, Android Chrome)
- **10% Tablet** (iPad Safari, Android tablets)

#### Volume Calculations

With 500,000 daily requests:

| Mode | Pool Size | Repetition Rate | Memory Usage |
|------|-----------|-----------------|--------------|
| Dynamic | N/A | <0.1% | Low |
| Pool | 10,000 | ~1% (50 uses/agent) | ~2MB |
| Pool | 50,000 | ~0.2% (10 uses/agent) | ~10MB |
| Hybrid | 5,000+ | <0.5% | ~1MB |

#### Monitoring User Agents

Check current statistics:
```bash
curl http://localhost:3000/user-agent-stats
```

Example output:
```json
{
  "mode": "dynamic",
  "totalRequests": 125000,
  "uniqueGenerated": 124987,
  "repetitionRate": "0.01%",
  "estimatedDailyCapacity": "Unlimited"
}
```

## Monitoring

```bash
# View logs (PM2)
pm2 logs proxy-service

# Monitor resources
pm2 monit

# Check status
pm2 status
```

## Troubleshooting

### Browser fails to launch

Check Chrome/Chromium installation:
```bash
google-chrome --version
```

Reinstall Puppeteer:
```bash
npm rebuild puppeteer
npx puppeteer browsers install chrome
```

### Memory issues

Increase memory limit for Docker:
```bash
docker run --memory=2g ...
```

For EC2, add swap space (see AWS deployment guide).

### Proxy connection fails

Test proxy directly:
```bash
curl -x http://USERNAME:PASSWORD@PROXY_HOST:PORT https://api.ipify.org
```

## Performance

- **Average response time:** 2-5 seconds per trace
- **Memory usage:** ~500MB base + ~200MB per concurrent trace
- **Recommended specs:** 2 vCPU, 2GB RAM minimum

## Security

- Always use HTTPS in production
- Store credentials in AWS Secrets Manager
- Implement API key authentication
- Use VPC and security groups
- Enable CloudWatch logging

## License

MIT
