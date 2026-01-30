# Redirect Path Tracer Guide

## Overview

The **Redirect Path Tracer** tool traces the complete redirect chain of a tracking URL, showing:

- ✅ Every redirect (301, 302, 307, etc.)
- ✅ Response headers at each step
- ✅ Where cookies are set (Set-Cookie headers)
- ✅ Final destination URL
- ✅ CORS headers
- ✅ Content-Type at each step

## How to Use

### 1. Open the Tool
```bash
# In your browser, open:
redirect-path-tracer.html

# Or serve via HTTP:
python3 -m http.server 8000
# Then visit: http://localhost:8000/redirect-path-tracer.html
```

### 2. Enter Your Tracking URL
Paste your Google Ads tracking URL in the input field:
```
https://ads.day24.online/click?offer_name=SURFSHARK_US_WW_SHEET_SMB&force_transparent=true&meta_refresh=true
```

### 3. Click "Trace Redirect Path"
The tool will:
1. Make the initial request
2. Follow each redirect
3. Log headers and cookies at each step
4. Stop at the final destination

## What You'll See

### Example Output

```
[Step 1] Fetching: https://ads.day24.online/click?offer_name=...
[Step 1] Status: 302 Found
[Step 1] Redirecting to: https://tracking.domain.com/page1

[Step 2] Fetching: https://tracking.domain.com/page1
[Step 2] Status: 302 Found
[Step 2] Set-Cookie: session=abc123; Path=/; HttpOnly
[Step 2] Redirecting to: https://final-landing.com

[Step 3] Fetching: https://final-landing.com
[Step 3] Status: 200 OK
[Step 3] Final destination reached
```

## Key Sections in Output

### 1. Trace Log (Top)
Real-time log of each step:
- URL being fetched
- HTTP status code
- Redirect location
- Any Set-Cookie headers

### 2. Redirect Chain (Middle)
Visual representation of the full path:
- **Step 1 (Blue):** Initial URL
- **Step 2+ (Orange):** Intermediate redirects
- **Final (Green):** Final destination

### 3. Cookie Analysis (Bottom)
All cookies set during the trace:
- Which step set the cookie
- What URL set it
- Full cookie value (including attributes like SameSite, Secure, etc.)

## Troubleshooting

### CORS Errors
If you see "CORS error blocked":
- The server may not allow `redirect: 'manual'`
- This is actually normal - it means the server needs CORS headers
- Check the server's CORS configuration

### Redirect Loop
If the trace doesn't stop:
- Might be infinite redirect loop
- Max 20 steps to prevent freezing
- Check if URL redirects back to itself

### No Cookies Shown
If no Set-Cookie headers appear:
- Server isn't setting cookies
- Check if `/click` endpoint is actually setting cookies
- Verify in server logs

## Checking Server-Side

To verify your tracking endpoint is setting cookies:

```javascript
// In proxy-service/routes/google-ads-click.js

// Step 1: Set a tracking cookie
res.setHeader('Set-Cookie', [
  'tracking_id=unique_value; Path=/; HttpOnly; SameSite=Lax',
  'session=session_value; Path=/; Secure; SameSite=None'
]);

// Step 2: Set CORS headers if cross-domain
res.setHeader('Access-Control-Allow-Origin', request.headers.origin);
res.setHeader('Access-Control-Allow-Credentials', 'true');

// Step 3: Redirect or respond
res.setHeader('Location', finalUrl);
res.statusCode = 302;
res.end();
```

## Cookie Attributes to Look For

| Attribute | Purpose | Notes |
|-----------|---------|-------|
| **Path=/** | Cookie scope | Should be `/` to be available everywhere |
| **HttpOnly** | Security | Prevents JavaScript access (good for security) |
| **Secure** | HTTPS only | Required for SameSite=None |
| **SameSite=None** | Cross-site | Required for third-party cookies; needs Secure |
| **SameSite=Lax** | Same-site | Default, allows top-level redirects |
| **Max-Age** | Expiration | In seconds (e.g., 2592000 for 30 days) |

## Expected Cookie Flow for Silent Fetch

```
[Step 1] GET /click
Response: 302 Found
Set-Cookie: google_ads_session=xyz; SameSite=None; Secure
Location: https://tracking.intermediate.com/track

[Step 2] GET /track  
Response: 302 Found
Set-Cookie: utm_source=google; Path=/
Location: https://final-landing-page.com

[Step 3] GET /
Response: 200 OK
Set-Cookie: user_session=abc; Path=/
```

## Command Line Alternative

If you want to trace the path via command line:

```bash
# Using curl with verbose output
curl -v -L "https://ads.day24.online/click?offer_name=..." 2>&1 | grep -E "(HTTP|Location|Set-Cookie)"

# Using wget
wget -S --spider "https://ads.day24.online/click?offer_name=..."
```

## Browser DevTools (Alternative Method)

1. Open DevTools (F12)
2. Go to **Network** tab
3. Open your tracking URL in new tab
4. Watch the request chain:
   - Click shows initial request
   - Each redirect shows in sequence
   - Click each request to see headers
   - Look for "Set-Cookie" in Response Headers

## Files

- `redirect-path-tracer.html` - Interactive redirect tracing tool
- This guide - Usage and troubleshooting

## Common Issues & Fixes

### Issue: "Cannot read property getSetCookie"
**Cause:** Using older browser without `getSetCookie()` support
**Fix:** Manually parse Set-Cookie from headers

### Issue: Maximum steps reached
**Cause:** Infinite redirect loop or too many redirects
**Fix:** Check if URL redirects to itself or has circular dependency

### Issue: No redirects shown, just 200 OK
**Cause:** URL doesn't redirect, direct response
**Fix:** This is normal - check if final URL is correct

### Issue: CORS blocked
**Cause:** Cross-origin fetch without proper CORS headers
**Fix:** Server must include `Access-Control-Allow-Origin` header
