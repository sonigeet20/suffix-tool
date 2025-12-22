# AWS Proxy Service Environment Setup

## Critical: Add Supabase Credentials

Your AWS proxy service at `http://13.221.79.118:3000` needs Supabase credentials to load Luna proxy settings from the database.

### SSH into your AWS EC2 instance:

```bash
ssh -i YOUR_KEY.pem ubuntu@13.221.79.118
```

### Navigate to the proxy service directory:

```bash
cd /opt/url-tracker-proxy
```

### Edit the .env file:

```bash
nano .env
```

### Add these environment variables (use the values from your main project):

```env
# Existing configuration
PORT=3000
NODE_ENV=production

# User Agent Configuration
USER_AGENT_POOL_SIZE=10000
USER_AGENT_MODE=dynamic
USER_AGENT_REFRESH_INTERVAL_HOURS=12

# **ADD THESE SUPABASE CREDENTIALS**
SUPABASE_URL=https://rfhuqenntxiqurplenjn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE
```

### Restart the service:

```bash
pm2 restart all
pm2 logs
```

### Verify it's working:

```bash
# From your local machine
curl http://13.221.79.118:3000/health
```

You should see `"browser_initialized": true` after a few seconds.

## Why This Is Needed

The AWS proxy service loads Luna proxy credentials from your Supabase `settings` table instead of hardcoded .env values. This allows you to:

1. Update proxy credentials from your web interface
2. Support multiple users with different Luna accounts
3. Change proxy settings without redeploying the AWS service

## After Setup

Once Supabase credentials are added, the proxy service will:
- Load Luna proxy settings from the database
- Initialize Puppeteer with those proxy credentials
- Route all traces through Luna residential proxies
- Return real geo-location data with each trace
