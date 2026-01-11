# Configuration Sources - Geo Targeting, Referrer & Tracking URLs

## 1. GEO TARGETING (target_geo / target_country)

### Where it's Configured:
- **Frontend**: [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L569) → "Settings" tab
  - Input field: "Target Geo" (line 569)
  - Stored in: `formData.target_geo`

- **Database**: [src/lib/supabase.ts](src/lib/supabase.ts#L38) → `offers` table
  - Column: `target_geo` (string)
  - Also: `target_country` (for backwards compatibility)

### Usage:
```typescript
// Line 324 in OfferForm.tsx
target_country: formData.target_geo || null
```

### How it's Used:
1. **Proxy Selection**: Passed to Luna Proxy API to select IPs from that country
2. **User Agent Rotation**: Device distribution configured per offer
3. **Browser Tracer**: Geo parameter sent to browser context

### Backend Usage:
- [proxy-service/server.js](proxy-service/server.js) → Uses `target_country` when calling Luna Proxy or selecting proxy provider
- Edge functions use geo from offer config

---

## 2. REFERRER (custom_referrer)

### Where it's Configured:
- **Frontend**: [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L1062) → "Settings" tab
  - Input field: "Custom Referrer" (line 1062)
  - Stored in: `formData.custom_referrer`

- **Database**: [src/lib/supabase.ts](src/lib/supabase.ts#L40) → `offers` table
  - Column: `custom_referrer` (string)

### Example Values:
```
https://www.google.com
https://www.bing.com
https://www.facebook.com
https://www.youtube.com
```

### How it's Used:
1. **HTTP Headers**: Added to all trace requests
   ```
   Referer: [custom_referrer value]
   ```

2. **Browser Context**: Set as referrer in browser tracer
3. **Anti-Cloaking**: Uses referrer to bypass detection

### Backend Usage:
- [proxy-service/server.js](proxy-service/server.js) → Line ~2100+ (traceRedirectsHttpOnly)
  - Sets HTTP `Referer` header to `custom_referrer`
- [supabase/functions/trace-redirects/index.ts](supabase/functions/trace-redirects/index.ts)
  - Passes referrer to fetch headers

---

## 3. TRACKING URLs FROM ROTATION

### Where it's Configured:
- **Frontend**: [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L1112) → "Rotation" tab
  - "Tracking URLs" section (line 1112)
  - Add/Remove buttons for multiple URLs
  - Stored in: `formData.tracking_urls`

### Data Structure:
```typescript
interface TrackingUrl {
  url: string;              // The actual tracking URL
  weight: number;           // 1-100, probability weight
  enabled: boolean;         // Active or disabled
  label?: string;          // Optional description
}

// Example:
[
  {
    url: "https://aff.network.com/click?aid=123&subid={subid}",
    weight: 50,
    enabled: true,
    label: "Primary Network"
  },
  {
    url: "https://aff2.network.com/track?id=456&sid={subid}",
    weight: 30,
    enabled: true,
    label: "Backup Network"
  },
  {
    url: "https://aff3.network.com/pixel?ref={subid}",
    weight: 20,
    enabled: true,
    label: "Pixel Network"
  }
]
```

### Rotation Modes:
- **sequential** - Rotates through URLs in order
- **random** - Picks randomly each time
- **weighted-random** - Uses `weight` field for probability
- **failover** - Uses next URL if previous fails

### How it's Used:

#### 1. **Get Suffix API** (main entry point):
- Edge function: [supabase/functions/get-suffix/index.ts](supabase/functions/get-suffix/index.ts)
- Selects a tracking URL from the rotation pool
- Returns it as the suffix/passthrough

#### 2. **Track-Hit-Instant API**:
- Redirects through selected tracking URL
- Parameters appended based on `suffix_pattern`
- Final destination: selected tracking URL

#### 3. **Backend Processing**:
- [proxy-service/server.js](proxy-service/server.js) → Line ~2600+ (handleTrackHitInstant)
  - Selects tracking URL based on rotation mode
  - Appends suffix parameters
  - Redirects user

### Selection Logic (Backend):
```javascript
// From proxy-service/server.js (approx line 2600+)
function selectTrackingUrl(trackingUrls, rotationMode) {
  const enabledUrls = trackingUrls.filter(u => u.enabled);
  
  if (rotationMode === 'sequential') {
    // Cycle through in order
    return enabledUrls[Math.random() % enabledUrls.length];
  } else if (rotationMode === 'weighted-random') {
    // Use weight probabilities
    return selectByWeight(enabledUrls);
  } else if (rotationMode === 'random') {
    // Pure random
    return enabledUrls[Math.floor(Math.random() * enabledUrls.length)];
  }
}
```

---

## 4. SUFFIX PATTERN

### Where it's Configured:
- **Frontend**: [src/components/OfferForm.tsx](src/components/OfferForm.tsx) → "Settings" tab
  - Field: "Suffix Pattern"
  - Stored in: `formData.suffix_pattern`

### Example Values:
```
?clickid={clickid}
?gclid={gclid}&fbclid={fbclid}
?sid={subid}&campaign={campaign}
?p1={p1}&p2={p2}&p3={p3}...&p10={p10}
```

### How it's Used:
1. **Appended to Tracking URLs**:
   ```
   https://aff.network.com/click?aid=123 + ?clickid={clickid}
   = https://aff.network.com/click?aid=123&clickid=abc123xyz
   ```

2. **Parameter Extraction**:
   - During tracing, the suffix pattern parameters are extracted
   - Values stored in `last_traced_chain` and other trace fields

3. **Trackier Integration**:
   - Used with p1-p10 mapping for Trackier campaigns
   - Each parameter maps to Trackier's sub_id fields

---

## 5. COMPLETE FLOW

```
USER CLICK
    ↓
[Track-Hit-Instant API]
    ↓
SELECT TRACKING URL FROM ROTATION
    ├─ From: offers.tracking_urls array
    ├─ Mode: offers.tracking_url_rotation_mode
    ├─ Weight: tracking_urls[].weight
    └─ Selected: Best URL based on mode
    ↓
BUILD FINAL URL
    ├─ Base: selected tracking URL
    ├─ Add Referer: offers.custom_referrer
    ├─ Add Suffix: offers.suffix_pattern
    ├─ Add Geo: offers.target_geo → Luna Proxy IP
    └─ Result: https://aff.net/...?clickid=123&...
    ↓
REDIRECT USER
    ├─ Send through selected tracking URL
    ├─ With custom referrer headers
    ├─ From geo-targeted IP proxy
    └─ Track the click
    ↓
BACKGROUND TRACE
    ├─ Trace redirect chain starting from final_url
    ├─ Extract parameters using suffix_pattern
    ├─ Apply geo-targeting to proxy
    ├─ Use custom_referrer
    └─ Store results
```

---

## 6. DATABASE SCHEMA

```sql
-- offers table relevant columns
CREATE TABLE offers (
  id UUID,
  offer_name TEXT,
  final_url TEXT,
  tracking_template TEXT,
  suffix_pattern TEXT,
  target_geo TEXT,           -- ← GEO TARGETING
  target_country TEXT,       -- ← ALT GEO (deprecated)
  custom_referrer TEXT,      -- ← REFERRER
  tracking_urls JSONB,       -- ← TRACKING URLs ARRAY
  tracking_url_rotation_mode TEXT,  -- sequential|random|weighted-random|failover
  ...
);
```

---

## 7. KEY FILES INVOLVED

| Component | File | Purpose |
|-----------|------|---------|
| **Geo Config** | [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L569) | Input field |
| **Referrer Config** | [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L1062) | Input field |
| **Tracking URLs** | [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L1112) | Rotation config |
| **DB Schema** | [src/lib/supabase.ts](src/lib/supabase.ts) | Type definitions |
| **API: Get Suffix** | [supabase/functions/get-suffix/](supabase/functions/get-suffix/) | Selects URL & params |
| **API: Track Hit** | [proxy-service/server.js](proxy-service/server.js) | Redirects through URL |
| **Tracer** | [proxy-service/server.js](proxy-service/server.js#L2100+) | Applies geo/referrer |

---

## Testing Trackier with p11-p15

**Result**: Trackier API likely **accepts p11-p15** but may not use them by default.

**To Enable Extended Parameters**:
1. Contact Trackier support to enable p11-p15 in your account
2. Update UI to support p11-p15 mapping
3. Send via webhook with extended sub_ids

**UI Update** (if Trackier confirms):
Change in [src/components/TrackierSetup.tsx](src/components/TrackierSetup.tsx):
```typescript
// From:
{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {

// To:
{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((num) => {
```
