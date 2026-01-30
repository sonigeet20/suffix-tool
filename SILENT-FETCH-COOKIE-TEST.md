# Silent Fetch Cookie Testing Guide

## Quick Start

1. **Open in Fresh Browser/Incognito Window** (this clears all existing cookies)
   - `open -a "Google Chrome" --new --args --incognito silent-fetch-cookie-test.html`
   - Or just drag `silent-fetch-cookie-test.html` into your browser

2. **Update the Tracking URL** 
   - Replace with your actual offer's tracking URL from GoogleAdsModal
   - Example: `https://ads.day24.online/click?offer_name=SURFSHARK_US_WW_SHEET_SMB&force_transparent=true&meta_refresh=true`

3. **Click "Test Silent Fetch" Button**
   - Watch the execution log below
   - It will attempt to fetch the tracking URL with credentials

4. **Check Results**
   - **Cookies Section:** Shows if any cookies were set
   - **Network Tab (F12):** See the actual fetch request
   - **Browser Console (F12):** Check for CORS or other errors

## What You're Looking For

✅ **SUCCESS Indicators:**
- [ ] Fetch request appears in Network tab (F12)
- [ ] Response includes `Set-Cookie` header
- [ ] New cookies appear in the "Cookies After Fetch" section
- [ ] No CORS errors in console

❌ **FAILURE Indicators:**
- [ ] Fetch request doesn't appear in Network tab
- [ ] CORS error: "Access to XMLHttpRequest blocked by CORS policy"
- [ ] Response has no `Set-Cookie` header
- [ ] No cookies appear after fetch

## Understanding the Test

### What the test does:
1. Sends a `fetch()` request to your tracking URL with `credentials: 'include'`
2. This is exactly what the silent fetch JavaScript does on Google Ads clicks
3. The request includes:
   - User's existing cookies (if any)
   - No-CORS mode (bypasses browser CORS checks for the response)
   - Proper credentials flag

### Why cookies might not be set:

| Reason | Fix |
|--------|-----|
| **CORS Not Configured** | Server must respond with `Access-Control-Allow-Credentials: true` |
| **SameSite Restriction** | Server must set `SameSite=None; Secure` on cookies |
| **Same-Domain Only** | If tracking URL is same domain as this page, cookies should work |
| **Server Not Setting Cookies** | Check if tracking URL endpoint actually sets `Set-Cookie` header |
| **HTTPS Required** | SameSite=None requires HTTPS |

## Network Tab Checklist

Open DevTools (F12) → Network Tab, then click "Test Silent Fetch":

### Check the Request:
```
Headers → Request Headers:
  - User-Agent: ✓ (should see browser user agent)
  - Cookie: (should see if credentials exist)
  - Sec-Fetch-* headers: ✓ (indicates fetch request)
```

### Check the Response:
```
Headers → Response Headers:
  - Access-Control-Allow-Credentials: true (if cross-domain)
  - Set-Cookie: [name]=[value]; SameSite=None; Secure
  - Access-Control-Allow-Origin: * or your domain
```

## Debugging CORS Issues

If you see: "Access to fetch blocked by CORS policy"

The server needs to respond with:
```
Access-Control-Allow-Origin: [requesting domain]
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

For cross-domain cookies, also add to Set-Cookie:
```
Set-Cookie: session=xyz123; SameSite=None; Secure; HttpOnly
```

## Server-Side Check

Check if your `/click` endpoint is setting cookies:

```javascript
// In proxy-service/routes/google-ads-click.js
res.setHeader('Set-Cookie', 'google_ads_session=...; SameSite=None; Secure; Path=/');
res.setHeader('Access-Control-Allow-Credentials', 'true');
res.setHeader('Access-Control-Allow-Origin', request.headers.origin);
```

## Quick Test Commands

**Open the test page locally:**
```bash
# macOS
open silent-fetch-cookie-test.html

# Linux
xdg-open silent-fetch-cookie-test.html

# Windows
start silent-fetch-cookie-test.html
```

**Or serve it via simple HTTP:**
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
python3 -m http.server 8000
# Then open: http://localhost:8000/silent-fetch-cookie-test.html
```

## Expected Behavior

**Scenario 1: Same Domain**
- ✓ Cookies WILL be set automatically
- ✓ No CORS issues
- ✓ Silent fetch works perfectly

**Scenario 2: Cross-Domain (Different Domain)**
- ⚠️ Requires proper CORS headers on server
- ⚠️ Requires SameSite=None; Secure
- ⚠️ May need to adjust cookie attributes

**Scenario 3: Third-Party Context**
- ❌ May be blocked by browser privacy settings
- ❌ May be blocked by Safari ITP, Chrome 3PC restrictions

## Files Created

- `silent-fetch-cookie-test.html` - Interactive test page
- This file - Instructions and debugging guide
