# Offer Target Geo/Country Storage and fill-geo-buckets Analysis

## Executive Summary

**CRITICAL FINDING:** `fill-geo-buckets` **DOES NOT RESPECT** offer target geos. It creates buckets for ALL configured geos (or caller-specified geos) regardless of what geo(s) the offer is actually targeting. This is a significant architectural mismatch.

---

## Part 1: Where Offers Store Target Geo/Country Data

### Database Schema
**Location:** [supabase/migrations/20260128_google_ads_click_tracker.sql](supabase/migrations/20260128_google_ads_click_tracker.sql#L74)

The `offers` table stores geo targeting in **two places**:

1. **`target_geo` column (TEXT)** - Primary field
   - User-configured via [src/components/OfferForm.tsx](src/components/OfferForm.tsx#L824-L834)
   - Single country code (e.g., 'US', 'GB', 'ES')
   - Used for proxy geo-targeting via Luna Proxy

2. **`google_ads_config` column (JSONB)** - Secondary structure containing:
   ```json
   {
     "enabled": boolean,
     "max_traces_per_day": number,
     "apply_filters": boolean,
     "single_geo_targets": ["US", "GB", "ES", ...],  // ← List of single-geo buckets
     "multi_geo_targets": ["US,GB,ES", "US,GB,DE", ...],  // ← List of multi-geo buckets
     "silent_fetch_enabled": boolean,
     "silent_fetch_url": string,
     "filtering": { ... }
   }
   ```

### Where offer geo data is configured/retrieved:

| Component | Location | What It Stores |
|-----------|----------|---|
| **Frontend Form** | [src/components/OfferForm.tsx:824-834](src/components/OfferForm.tsx#L824-L834) | `target_geo` (single country) |
| **Frontend GoogleAds Modal** | [src/components/GoogleAdsModal.tsx:33-48](src/components/GoogleAdsModal.tsx#L33-L48) | `GoogleAdsConfig` including `single_geo_targets` and `multi_geo_targets` |
| **Database - Offer Info** | [supabase/migrations/20260128_google_ads_click_tracker.sql:74](supabase/migrations/20260128_google_ads_click_tracker.sql#L74) | `google_ads_config JSONB` column |

---

## Part 2: fill-geo-buckets Edge Function Logic

### Function Location
[supabase/functions/fill-geo-buckets/index.ts](supabase/functions/fill-geo-buckets/index.ts)

### Request Interface (Lines 13-19)
```typescript
interface FillBucketsRequest {
  offer_name: string
  single_geo_targets?: string[] // e.g., ['US', 'GB', 'ES']
  multi_geo_targets?: string[] // e.g., ['US,GB,ES', 'US,GB']
  single_geo_count?: number // Suffixes per single geo (default: 30)
  multi_geo_count?: number // Suffixes per multi geo (default: 10)
  force?: boolean // Bypass daily limits
}
```

### Critical Logic Flow

#### 1. **Request Parsing (Lines 32-44)**
```typescript
const { 
  offer_name, 
  single_geo_targets = ['US', 'GB', 'ES', 'DE', 'FR', 'IT', 'CA', 'AU'],  // ← HARDCODED DEFAULT
  multi_geo_targets = ['US,GB,ES', 'US,GB,DE', 'US,CA,AU'],              // ← HARDCODED DEFAULT
  single_geo_count = 30,
  multi_geo_count = 10,
  force = false
} = body
```

**⚠️ KEY ISSUE:** The function accepts `single_geo_targets` and `multi_geo_targets` as **REQUEST parameters**, not from the **offer's configuration**.

#### 2. **Offer Verification (Lines 76-98)**
```typescript
// Get the offer
const { data: offer, error: offerError } = await supabase
  .from('offers')
  .select('id, offer_name, google_ads_config')
  .eq('offer_name', offer_name)
  .single()

// Check if Google Ads is enabled
const googleAdsConfig = offer.google_ads_config || {}
if (!googleAdsConfig.enabled) {
  return error: `Google Ads not enabled for offer`
}
```

**⚠️ ONLY checks if Google Ads is enabled** - does NOT read or validate target geos from the offer.

#### 3. **Get Current Bucket Status (Lines 97-98)**
```typescript
const { data: currentStats } = await supabase
  .rpc('get_bucket_stats', { p_offer_name: offer_name })
```

**RPC Details:** [supabase/migrations/20260128_google_ads_click_tracker.sql:224-243](supabase/migrations/20260128_google_ads_click_tracker.sql#L224-L243)
- Returns bucket stats **for ANY target_country in geo_suffix_buckets**
- Does NOT filter by offer's target_geo
- Lists all countries with their available suffix counts

#### 4. **Fill Single Geo Buckets (Lines 115-237)**
```typescript
const singleGeoResults = await Promise.all(
  single_geo_targets.map(async (country) => {
    // For EACH country in the caller-provided list (not offer's list):
    
    // Check current bucket status
    const currentStat = currentStats?.find((s: any) => s.target_country === country)
    const availableSuffixes = currentStat?.available_suffixes || 0

    // Skip if already full
    if (availableSuffixes >= single_geo_count && !force) {
      return { status: 'skipped', available: availableSuffixes }
    }

    // Calculate how many to generate
    const needed = single_geo_count - availableSuffixes

    // For each needed suffix, call get-suffix and store in geo_suffix_buckets
    for (let i = 0; i < needed; i++) {
      const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${offer_name}`
      const suffixResponse = await fetch(getSuffixUrl, { method: 'GET' })
      
      // Store result in geo_suffix_buckets with target_country = country
      const { error: insertError } = await supabase
        .from('geo_suffix_buckets')
        .insert({
          offer_name: offer_name,
          target_country: country,          // ← Set to caller's country
          suffix: suffix,
          hop_count: suffixResult.hop_count,
          final_url: suffixResult.final_url,
          traced_at: new Date().toISOString(),
          is_used: false,
          metadata: { generated_by: 'fill-geo-buckets' }
        })
    }
  })
)
```

#### 5. **Fill Multi-Geo Buckets (Lines 240-364)**
```typescript
const multiGeoResults = multi_geo_count > 0 ? await Promise.all(
  multi_geo_targets.map(async (geoGroup) => {  // ← geoGroup e.g., 'US,GB,ES'
    // Same logic as single geo, but:
    const currentStat = currentStats?.find((s: any) => s.target_country === geoGroup)
    
    // Stores with target_country = 'US,GB,ES' (the full group, not individual countries)
    await supabase.from('geo_suffix_buckets').insert({
      target_country: geoGroup,  // ← The combined string
      // ... same fields ...
    })
  })
) : []
```

---

## Part 3: RPC Call Details

### `get_bucket_stats(p_offer_name TEXT)` Function

**Location:** [supabase/migrations/20260128_google_ads_click_tracker.sql:224-243](supabase/migrations/20260128_google_ads_click_tracker.sql#L224-L243)

**Returns:**
```sql
TABLE (
    target_country TEXT,              -- ANY country in geo_suffix_buckets for this offer
    total_suffixes BIGINT,            -- Total count (used + unused)
    available_suffixes BIGINT,        -- Count where is_used = FALSE
    used_suffixes BIGINT,             -- Count where is_used = TRUE
    oldest_unused TIMESTAMPTZ,        -- Oldest unused suffix timestamp
    newest_unused TIMESTAMPTZ         -- Newest unused suffix timestamp
)
```

**Query Logic (Lines 232-240):**
```sql
SELECT 
    gsb.target_country,
    COUNT(*) as total_suffixes,
    COUNT(*) FILTER (WHERE gsb.is_used = FALSE) as available_suffixes,
    COUNT(*) FILTER (WHERE gsb.is_used = TRUE) as used_suffixes,
    MIN(gsb.traced_at) FILTER (WHERE gsb.is_used = FALSE) as oldest_unused,
    MAX(gsb.traced_at) FILTER (WHERE gsb.is_used = FALSE) as newest_unused
FROM geo_suffix_buckets gsb
WHERE gsb.offer_name = p_offer_name
GROUP BY gsb.target_country
ORDER BY gsb.target_country;
```

**Key Points:**
- Groups by `target_country` (can be 'US', 'GB', 'US,GB,ES', etc.)
- Returns ALL distinct `target_country` values for the offer
- No filtering by offer's actual target geo
- Does NOT validate if countries match offer configuration

---

## Part 4: How fill-geo-buckets is Called

### From Frontend (GoogleAdsModal)
**Location:** [src/components/GoogleAdsModal.tsx:298-321](src/components/GoogleAdsModal.tsx#L298-L321)

```typescript
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fill-geo-buckets`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      offer_name: offerName,
      single_geo_targets: config.single_geo_targets,       // ← From config state
      multi_geo_targets: config.multi_geo_targets,         // ← From config state
      single_geo_count: singleGeoCount,                    // ← User input
      multi_geo_count: multiGeoCount,                      // ← User input
      force: false
    })
  }
);
```

### From Backend (google-ads-click.js)
**Location:** [proxy-service/routes/google-ads-click.js:420-457](proxy-service/routes/google-ads-click.js#L420-L457)

```typescript
async function triggerGeoPoolPrefill(offerName, geoPool, googleAdsConfig = {}) {
  try {
    const payload = {
      offer_name: offerName,
      single_geo_targets: geoPool,                              // ← From geo_pool (offer's geo_pool)
    };

    if (Array.isArray(googleAdsConfig.multi_geo_targets) && googleAdsConfig.multi_geo_targets.length > 0) {
      payload.multi_geo_targets = googleAdsConfig.multi_geo_targets;
    }

    if (typeof googleAdsConfig.single_geo_count === 'number') {
      payload.single_geo_count = googleAdsConfig.single_geo_count;
    }

    if (typeof googleAdsConfig.multi_geo_count === 'number') {
      payload.multi_geo_count = googleAdsConfig.multi_geo_count;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/fill-geo-buckets`, {
      method: 'POST',
      // ... headers ...
      body: JSON.stringify(payload)
    });
  }
}
```

---

## Part 5: Architectural Problem - What's Missing

### The Core Issue

The `offer` table stores **TWO INDEPENDENT** geo configurations:

1. **`target_geo`** - The offer's primary target country
   - Intended for: Proxy routing, user agent selection
   - Retrieved by: Proxy service, Luna Proxy API calls
   - **NOT used by fill-geo-buckets**

2. **`google_ads_config.single_geo_targets`** - List of countries to prefill
   - Intended for: Which countries to pre-trace suffixes for
   - Retrieved by: GoogleAdsModal UI, click handler
   - **Used by fill-geo-buckets IF caller provides it**

### What fill-geo-buckets Does

```
fill-geo-buckets(offer_name, single_geo_targets) 
├─ NO validation that single_geo_targets matches offer.target_geo
├─ NO validation that single_geo_targets matches google_ads_config.single_geo_targets
├─ Creates buckets for ANY geos provided in the request (defaults to ['US', 'GB', 'ES', ...])
└─ Returns buckets regardless of offer's actual geo targeting
```

### Scenario Where This Breaks

1. Offer is created with `target_geo = 'US'`
2. Admin configures `google_ads_config.single_geo_targets = ['US']`
3. Frontend UI calls fill-geo-buckets with default `single_geo_targets = ['US', 'GB', 'ES', 'DE', 'FR', 'IT', 'CA', 'AU']`
4. Result: **Buckets created for 8 countries, not 1**
5. When click comes in from 'GB', system serves 'GB' suffix even though offer targets only 'US'

---

## Part 6: Summary Table

| Aspect | Details |
|--------|---------|
| **Offer target geo storage** | `offers.target_geo` (single country) |
| **Offer Google Ads config** | `offers.google_ads_config` JSONB with `single_geo_targets`, `multi_geo_targets` arrays |
| **fill-geo-buckets request params** | `single_geo_targets`, `multi_geo_targets` (caller-provided, not from offer) |
| **fill-geo-buckets respect offer geos?** | **NO** - Creates buckets for ALL provided geos, ignores offer.target_geo |
| **RPC called** | `get_bucket_stats(offer_name)` - Returns stats for ANY target_country in buckets |
| **Database table** | `geo_suffix_buckets(offer_name, target_country, suffix, is_used, ...)` |
| **Does it validate geo match?** | **NO** - Only checks if Google Ads is enabled |
| **Default geos if not provided** | `['US', 'GB', 'ES', 'DE', 'FR', 'IT', 'CA', 'AU']` |

---

## Part 7: Code References

### Key Files
1. **Edge Function:** [supabase/functions/fill-geo-buckets/index.ts](supabase/functions/fill-geo-buckets/index.ts)
   - Lines 32-44: Request parsing with hardcoded defaults
   - Lines 76-98: Offer verification (only checks enabled flag)
   - Lines 115-237: Single geo filling loop
   - Lines 240-364: Multi geo filling loop

2. **RPC Function:** [supabase/migrations/20260128_google_ads_click_tracker.sql:224-243](supabase/migrations/20260128_google_ads_click_tracker.sql#L224-L243)
   - `get_bucket_stats()` - No geo validation

3. **Frontend Call:** [src/components/GoogleAdsModal.tsx:298-321](src/components/GoogleAdsModal.tsx#L298-L321)
   - Uses `config.single_geo_targets` from state

4. **Backend Call:** [proxy-service/routes/google-ads-click.js:420-457](proxy-service/routes/google-ads-click.js#L420-L457)
   - Uses `geoPool` from offer, `googleAdsConfig.multi_geo_targets`

---

## Recommendations

### Option 1: Validate Request Against Offer Config
Modify fill-geo-buckets to check that request geos match offer's configured geos:

```typescript
const requestedGeos = new Set(single_geo_targets || []);
const allowedGeos = new Set(googleAdsConfig.single_geo_targets || []);

if (![...requestedGeos].every(g => allowedGeos.has(g))) {
  throw new Error('Requested geos do not match offer configuration');
}
```

### Option 2: Use Offer Config Directly
Remove request parameters and use offer's config:

```typescript
const single_geo_targets = googleAdsConfig.single_geo_targets || [];
const multi_geo_targets = googleAdsConfig.multi_geo_targets || [];
```

### Option 3: Document Current Behavior
If current flexibility is intentional, document that:
- fill-geo-buckets creates buckets for ANY provided geos
- Callers are responsible for providing correct geo lists
- No validation against offer.target_geo occurs
