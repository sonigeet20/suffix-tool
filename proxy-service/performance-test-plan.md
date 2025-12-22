# Redirect Performance Testing & Optimization Plan

## Current Performance Issues Identified

### Bottlenecks in `proxy-service/server.js`
1. **Line 420-422**: `page.goto(url, { waitUntil: 'networkidle2' })`
   - Waits for NO network activity for 500ms
   - Extremely slow for sites with long-polling, analytics, etc.
   - **Impact**: 5-10 seconds per redirect

2. **Line 426**: `await page.waitForTimeout(2000)`
   - Hardcoded 2-second wait after navigation
   - **Impact**: 2 seconds per redirect × number of redirects = 10-30 seconds total

3. **Browser Overhead**
   - Full Puppeteer browser launch/page creation for every trace
   - **Impact**: 1-3 seconds per request

4. **No Parallelization**
   - Sequential processing of redirect chains
   - **Impact**: Linear time increase with chain length

## Optimization Phases

### Phase 1: Immediate Quick Wins (Target: 80% speed improvement)

#### Test 1: Change Navigation Strategy
**Current**:
```javascript
await page.goto(url, { waitUntil: 'networkidle2', timeout });
await page.waitForTimeout(2000);
```

**Proposed Options**:
```javascript
// Option A: domcontentloaded (fastest, works for most cases)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
// No additional wait needed

// Option B: load (medium speed, waits for all resources)
await page.goto(url, { waitUntil: 'load', timeout });
// No additional wait needed

// Option C: Minimal wait with commit
await page.goto(url, { waitUntil: 'commit', timeout });
await page.waitForTimeout(500); // Reduced from 2000ms
```

**Expected Results**:
- Option A: 2-4 seconds per redirect (90% faster)
- Option B: 3-6 seconds per redirect (75% faster)
- Option C: 1-3 seconds per redirect (95% faster)

**Test Command**:
```bash
# Test with a known redirect chain
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url": "YOUR_TEST_TRACKING_URL",
    "max_redirects": 5,
    "timeout_ms": 30000
  }'
```

#### Test 2: Page Context Reuse
**Current**: Creates new page for every request
**Proposed**: Reuse page context, only reset state

```javascript
// Global page pool
const pagePool = [];
const MAX_POOL_SIZE = 5;

async function getPage() {
  if (pagePool.length > 0) {
    return pagePool.pop();
  }
  const browser = await initBrowser();
  return await browser.newPage();
}

async function releasePage(page) {
  if (pagePool.length < MAX_POOL_SIZE) {
    // Reset page state
    await page.goto('about:blank');
    await page.setRequestInterception(false);
    pagePool.push(page);
  } else {
    await page.close();
  }
}
```

**Expected Results**: Save 1-2 seconds per request on browser initialization

---

### Phase 2: Hybrid Fetch + Browser Approach (Target: 95% speed improvement)

#### Test 3: Lightweight Fetch for HTTP Redirects

**Strategy**: Use native fetch with proper headers for HTTP 3xx redirects, only use browser for JS/meta redirects

```javascript
async function lightweightTrace(url, options) {
  const chain = [];
  let currentUrl = url;
  let redirectCount = 0;

  // Phase 1: Follow HTTP redirects with fetch
  while (redirectCount < maxRedirects) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': options.userAgent,
        'Referer': options.referrer || '',
      },
      // Add proxy configuration
    });

    const status = response.status;

    // HTTP redirect
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      chain.push({
        url: currentUrl,
        status,
        redirect_type: 'http',
        timing_ms: /* track timing */
      });
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
      continue;
    }

    // Check for JS/meta redirects in HTML
    if (status === 200) {
      const html = await response.text();
      const hasJSRedirect = /window\.location|location\.href|location\.replace/i.test(html);
      const hasMetaRedirect = /<meta[^>]*http-equiv=["']?refresh/i.test(html);

      if (hasJSRedirect || hasMetaRedirect) {
        // Switch to browser for complex redirects
        return await browserTrace(currentUrl, chain, options);
      }

      // Final destination
      chain.push({
        url: currentUrl,
        status,
        redirect_type: 'final',
      });
      break;
    }
  }

  return { success: true, chain };
}
```

**Expected Results**:
- HTTP-only chains: 0.3-1 second total (98% faster)
- Mixed chains: 2-5 seconds total (85% faster)

---

### Phase 3: Advanced Optimizations

#### Test 4: Concurrent Request Processing
**Strategy**: Process multiple redirect traces in parallel

```javascript
async function batchTraceRedirects(urls) {
  const results = await Promise.all(
    urls.map(url => traceRedirects(url, options))
  );
  return results;
}
```

**Expected Results**: Near-linear scaling with number of concurrent requests

#### Test 5: Smart Redirect Detection
**Strategy**: HEAD request first to check redirect type

```javascript
async function detectRedirectType(url) {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'manual'
  });

  if (response.status >= 300 && response.status < 400) {
    return 'http'; // Use lightweight fetch
  }

  return 'complex'; // Use browser
}
```

---

## Testing Protocol

### Benchmark Test Cases

1. **Simple HTTP Chain** (3-5 redirects, all HTTP 3xx)
   - Example: Bit.ly shortened URL
   - Current: ~20-30 seconds
   - Target: <2 seconds

2. **Mixed Chain** (HTTP + JavaScript redirect)
   - Example: Affiliate tracking URL
   - Current: ~30-45 seconds
   - Target: <5 seconds

3. **Complex Chain** (HTTP + Meta + JS)
   - Example: Multi-hop tracking system
   - Current: ~45-60 seconds
   - Target: <8 seconds

### Metrics to Track

For each test, record:
```json
{
  "test_id": "simple_http_chain",
  "url": "test_url",
  "redirect_count": 5,
  "total_time_ms": 1234,
  "breakdown": {
    "browser_init": 500,
    "redirect_1": 200,
    "redirect_2": 180,
    "redirect_3": 154,
    "redirect_4": 100,
    "redirect_5": 100
  },
  "optimization_version": "phase1_option_a"
}
```

---

## Implementation Recommendation

### Step 1: Test Phase 1 Changes (Low Risk)
1. Change `networkidle2` → `domcontentloaded`
2. Reduce `waitForTimeout(2000)` → `waitForTimeout(500)` or remove
3. Test with 10 sample URLs
4. Compare timing results

### Step 2: If Phase 1 succeeds, test Phase 2 (Medium Risk)
1. Implement hybrid fetch+browser approach
2. Test with same 10 URLs
3. Verify redirect chain accuracy (no missed steps)

### Step 3: Monitor Production Performance
1. Add timing metrics to all trace requests
2. Log slow requests (>10 seconds)
3. Alert on failures

---

## Risk Assessment

### Low Risk Changes ✅
- Navigation strategy change (domcontentloaded)
- Timeout reduction
- Add performance logging

### Medium Risk Changes ⚠️
- Page context reuse (test for memory leaks)
- Hybrid fetch approach (verify accuracy)

### High Risk Changes ❌
- Parallel processing (resource exhaustion)
- Connection pooling (complexity)

---

## Proposed Test Script

Create `proxy-service/test-performance.js`:

```javascript
const axios = require('axios');

const TEST_URLS = [
  {
    name: 'Simple HTTP Chain',
    url: 'https://bit.ly/test123', // Replace with real test URL
    expected_redirects: 3
  },
  {
    name: 'Affiliate Tracking',
    url: 'YOUR_TRACKING_TEMPLATE_HERE',
    expected_redirects: 5
  }
];

async function runPerformanceTest() {
  console.log('🧪 Starting Performance Tests\n');

  for (const test of TEST_URLS) {
    console.log(`Testing: ${test.name}`);
    console.log(`URL: ${test.url}`);

    const startTime = Date.now();

    try {
      const response = await axios.post('http://localhost:3000/trace', {
        url: test.url,
        max_redirects: 20,
        timeout_ms: 60000
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Success`);
      console.log(`   Duration: ${duration}ms (${(duration/1000).toFixed(2)}s)`);
      console.log(`   Redirects: ${response.data.total_steps}`);
      console.log(`   Per-redirect avg: ${(duration/response.data.total_steps).toFixed(0)}ms`);

      if (response.data.chain) {
        console.log(`   Timing breakdown:`);
        response.data.chain.forEach((step, i) => {
          console.log(`     Step ${i+1}: ${step.timing_ms}ms - ${step.redirect_type}`);
        });
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }

    console.log('');
  }
}

runPerformanceTest();
```

---

## Next Steps

**BEFORE making any code changes:**

1. ✅ Run current performance baseline tests
2. ✅ Document current timings
3. ✅ Test Phase 1 Option A changes in isolation
4. ✅ Verify redirect chain accuracy
5. ✅ Compare before/after metrics
6. ✅ If successful, proceed to Phase 2

**DO NOT implement changes without testing results first!**
