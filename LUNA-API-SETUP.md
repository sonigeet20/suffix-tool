# Luna Proxy API Setup - The FASTEST Solution

Your proxy integration is now complete using Luna Proxy's Universal Scraping API. No relay server needed!

## Why This is Better

**Luna API Method (Current - Recommended)**
- No server to deploy
- Simple REST API
- Works immediately in Supabase Edge Functions
- 1-minute setup

**Relay Server Method (Old)**
- ~~Deploy Node.js server to Railway/Render~~
- ~~Manage server uptime and costs~~
- ~~5-10 minute setup~~

## Setup (1 Minute)

### Step 1: Get Your Luna API Token

1. Log in to [Luna Proxy Dashboard](https://www.lunaproxy.com)
2. Navigate to **Advanced Proxy Solutions** → **Universal Scraping API**
3. Copy your API token

### Step 2: Configure in Your App

1. Go to your app's **Settings** page
2. Paste your Luna API token
3. Click **Save Settings**
4. Click **Test API** to verify

That's it! Your proxy is now working.

## How It Works

Luna's Universal Scraping API handles everything:

1. **Your Edge Function** → sends target URL to Luna API
2. **Luna API** → fetches URL through their proxy network
3. **Returns** → HTML content + proxy IP geolocation

All requests go through Luna's residential proxy network automatically.

## Testing

### Test in Settings
```
Settings → Enter Luna API Token → Test API
```

Should show:
- Proxy IP: (Luna's residential IP)
- Country: (Based on proxy location)
- City: (Proxy city)

### Test in Offer Tracer
```
Offers → Edit Offer → Tracer Tab → Enable "Use Proxy" → Trace URL
```

Should show:
- Each redirect step
- Final URL with parameters
- Proxy IP and geolocation

## Features That Use Proxy

When proxy is enabled (Luna API token configured), these features use it:

1. **URL Tracer** - Traces tracking URLs through proxies
2. **Get-Suffix API** - Extracts parameters using proxies
3. **Analytics** - Records proxy IP and geolocation

## API Costs

Luna charges based on API requests. Check your Luna dashboard for:
- Current usage
- Rate limits
- Pricing tier

Typical usage:
- Each trace = 1-20 API calls (depending on redirect chain length)
- Each get-suffix = 1-20 API calls per request
- Test API = 1 API call

## Troubleshooting

**"Luna API token required" error?**
- Make sure you saved the token in Settings
- Check token is correct (no extra spaces)

**"Luna API error" in traces?**
- Verify token is valid in Luna dashboard
- Check API rate limits
- Ensure you have API credits

**Proxy IP shows "unknown"?**
- Token may be invalid
- API may be rate-limited
- Check Luna dashboard for errors

**Still seeing client IP instead of proxy IP?**
- Make sure "Use Proxy" is enabled in Tracer
- Verify token is saved in Settings
- Check Edge Function logs in Supabase

## Documentation

- **Luna API Docs**: https://doc.lunaproxy.com/advanced-proxy-solutions/universal-scraping-api/getting-started
- **API Endpoint**: https://unlocker-api.lunaproxy.com/request

## Support

For Luna API issues:
- Contact Luna support through their dashboard
- Check API status page
- Review API documentation

For integration issues:
- Check Supabase Edge Function logs
- Test API connection in Settings
- Verify database has `luna_api_token` column
