# Google Ads Parallel Tracking Support

## Overview
Google Ads uses **parallel tracking** for faster page loads. When a user clicks an ad, Google simultaneously:
1. Redirects the user directly to the landing page
2. Fires tracking URLs in the background using `navigator.sendBeacon()`

## How It Works

### Traditional Tracking (Sequential)
```
User Click → Tracking Server → Landing Page
(slow, user waits for tracking)
```

### Parallel Tracking (Modern)
```
User Click ─┬→ Landing Page (instant)
            └→ Tracking Server (background via sendBeacon)
```

## Implementation

### Server Requirements
The `/click` endpoint must support **both GET and POST** requests:

- **GET**: Standard clicks when parallel tracking is disabled
- **POST**: Background tracking via `navigator.sendBeacon()` when parallel tracking is enabled

### Code Changes Made

#### 1. Server Route Handler (`server.js`)
```javascript
// Support both GET and POST for Google's parallel tracking
app.get('/click', googleAdsClickHandlers.handleClick);
app.post('/click', googleAdsClickHandlers.handleClick);
```

#### 2. Body Parser Middleware (`server.js`)
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

#### 3. Request Handler (`google-ads-click.js`)
```javascript
// Support both GET and POST
const params = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;

// For POST requests, return 204 No Content (sendBeacon doesn't follow redirects)
if (req.method === 'POST') {
  console.log(`[google-ads-click] POST request - returning 204 No Content`);
  return res.status(204).send();
}
```

## Google Ads Configuration

### Tracking Template
Use this in your Google Ads tracking template:

```
https://your-domain.com/click?offer_name=your_offer&url={lpurl}
```

### Final URL Suffix (Optional)
```
gclid={gclid}
```

### Key Google Ads Macros
- `{lpurl}` - Landing page URL (escaped)
- `{unescapedlpurl}` - Landing page URL (unescaped)
- `{gclid}` - Google Click Identifier
- `{ignore}` - Enables parallel tracking (Google adds automatically)

## Silent Fetch Mode Compatibility

With silent fetch enabled:
1. **GET Request** (user click): Returns full HTML with triple-method tracking and 3-second delay + redirect
2. **POST Request** (parallel tracking): Returns minimal HTML with immediate triple-method tracking (no redirect)

### How Client-Side Tracking Works (Both GET and POST)

Both request types fire tracking URLs using **client-side JavaScript** in the user's browser:

**Triple-Method Tracking:**
1. **Image Pixel** - Most reliable, follows redirects, sets cookies
2. **Beacon API** - Fire & forget, survives page navigation  
3. **Hidden IFrame** - Loads URL in background with full browser context

**Benefits:**
- ✅ Tracking fires from user's real browser (real IP, real cookies)
- ✅ Affiliate networks see actual user's location and device
- ✅ Cookies are set in user's browser on tracker's domain
- ✅ Works seamlessly with Google Ads parallel tracking
- ✅ No server-side proxy needed

Both methods log to `google_ads_silent_fetch_stats` table for tracking.

## Testing

### Test GET Request (Standard Click)
```bash
curl -X GET "http://localhost:3000/click?offer_name=test&url=https://example.com"
```

### Test POST Request (Parallel Tracking)
```bash
curl -X POST "http://localhost:3000/click?offer_name=test&url=https://example.com"
```

### Expected Responses
- **GET**: 302 redirect or HTML page
- **POST**: 204 No Content

## Benefits

✅ **Faster Load Times**: Users reach landing page instantly  
✅ **Better User Experience**: No waiting for tracking servers  
✅ **Google Compliance**: Required for optimal ad performance  
✅ **Improved Quality Score**: Faster landing pages = better Quality Score  
✅ **Full Tracking**: All clicks still logged to database

## Debugging

Check server logs for:
```
[google-ads-click] POST request received for offer: test_offer
[google-ads-click] POST request - returning 204 No Content
```

## Important Notes

1. **sendBeacon() sends POST**: Always use POST, cannot be changed
2. **No redirects for POST**: sendBeacon ignores redirect responses
3. **204 is correct**: "No Content" is the appropriate success response
4. **Parameters in query string**: Google includes params in URL even for POST
5. **Silent fetch works**: Logging still happens, just no HTML returned

## References

- [Google Ads Parallel Tracking](https://support.google.com/google-ads/answer/7650215)
- [navigator.sendBeacon() MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
