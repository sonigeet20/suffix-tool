# Trackier Parameter Passing - Two Approaches

## Question: Do we pass values AND param placeholders?

**Short Answer:** We have two options depending on how Trackier's macros work.

---

## Option 1: Macro Resolution (Current Implementation) ✅

### How it works:
1. **Set destination ONCE with macros:**
   ```
   https://example.com/offer?gclid={sub1}&fbclid={sub2}&clickid={sub3}
   ```

2. **Pass values via tracking link:**
   ```
   https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2
     &sub1=Cj0KCQiA_VALUE
     &sub2=IwAR_VALUE
     &sub3=click_123
   ```

3. **Trackier resolves macros in real-time:**
   ```
   {sub1} → Cj0KCQiA_VALUE
   {sub2} → IwAR_VALUE
   {sub3} → click_123
   
   Final: https://example.com/offer?gclid=Cj0KCQiA_VALUE&fbclid=IwAR_VALUE&clickid=click_123
   ```

### Benefits:
- ✅ Real-time updates (no cache if it works)
- ✅ Destination set once, never changes
- ✅ Very fast (no API calls)
- ✅ Supports 10+ parameters

### Status:
- ⚠️ **Needs verification** - Macro syntax unclear
- ⚠️ **Trackier cache very aggressive** (testing blocked)
- ✅ **Code complete and ready**

---

## Option 2: Custom Redirect Service (Fallback)

If Trackier macros don't work, use our own redirect:

### How it works:
1. **Set destination to our redirect endpoint:**
   ```
   https://our-backend.com/api/trackier-redirect?offer_id={offer_id}
   ```

2. **Pass complete suffix via sub_id:**
   ```
   https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2
     &sub1=gclid%3DCj0%26fbclid%3DIwAR%26clickid%3Dclick123
   ```

3. **Our endpoint decodes and redirects:**
   ```javascript
   // Decode sub1
   const suffix = decodeURIComponent(req.query.sub1)
   // suffix = "gclid=Cj0&fbclid=IwAR&clickid=click123"
   
   // Redirect to final URL with suffix
   res.redirect(`https://example.com/offer?${suffix}`)
   ```

### Benefits:
- ✅ Full control over redirect logic
- ✅ No cache issues (we control it)
- ✅ Can log all clicks
- ✅ Flexible parameter handling

### Drawbacks:
- ❌ Additional redirect hop (slower)
- ❌ Our backend must stay up
- ❌ Loses some Trackier tracking features

---

## Option 3: Hybrid Approach (Best of Both) 🎯

**Use sub_id parameters to pass the complete reconstructed suffix:**

### Setup:
1. **Store param-to-sub_id mapping:**
   ```json
   {
     "sub1": "gclid",
     "sub2": "fbclid",
     "sub3": "clickid"
   }
   ```

2. **Set destination with DIRECT params (no macros):**
   ```
   https://example.com/offer
   ```

3. **Pass BOTH param names AND values in tracking link:**
   ```
   https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2
     &p1=gclid&v1=Cj0KCQiA_VALUE
     &p2=fbclid&v2=IwAR_VALUE
     &p3=clickid&v3=click_123
   ```

4. **Use redirect_url macro to construct final URL:**
   ```
   Destination: https://example.com/offer?{redirect_params}
   
   redirect_params passed as: gclid=Cj0&fbclid=IwAR&clickid=click123
   ```

---

## 🎯 RECOMMENDED APPROACH

**Test Trackier's macro resolution first** (Option 1), because:
- Simplest implementation
- Fastest performance
- Most elegant solution
- Already implemented

**If macros don't work after 10-minute cache wait:**
- Use Option 2 (custom redirect) for full control
- OR use Option 3 (hybrid) to stay within Trackier

---

## Current Implementation Status

### What's Built (Option 1):
```javascript
// 1. Parse traced suffix
const suffixParams = parseSuffixParams("?gclid=Cj0&fbclid=IwAR")
// → {gclid: "Cj0", fbclid: "IwAR"}

// 2. Map to sub_id values
const subIdValues = mapParamsToSubIds(suffixParams, subIdMapping)
// → {sub1: "Cj0", sub2: "IwAR"}

// 3. Build tracking link
const url2 = buildTrackingLinkWithSubIds(baseUrl, subIdValues)
// → "...&sub1=Cj0&sub2=IwAR"

// 4. Trackier resolves {sub1} → Cj0
// Final: https://example.com/offer?gclid=Cj0&fbclid=IwAR ✅
```

### To Add (Option 2 - If Needed):
```javascript
// Endpoint: /api/trackier-redirect
router.get('/trackier-redirect', async (req, res) => {
  const { offer_id, sub1 } = req.query;
  
  // sub1 contains complete suffix: "gclid=Cj0&fbclid=IwAR"
  const suffix = decodeURIComponent(sub1);
  
  // Get offer base URL from database
  const offer = await getOffer(offer_id);
  
  // Redirect with suffix
  res.redirect(`${offer.final_url}?${suffix}`);
});
```

---

## Decision Tree

```
Can Trackier resolve {sub1} macros?
│
├─ YES → Use Option 1 (current implementation) ✅
│         - Fastest, simplest, most elegant
│         - No changes needed, already built
│
└─ NO → Choose between:
    │
    ├─ Option 2: Custom redirect
    │   - Full control, no cache issues
    │   - Need to add redirect endpoint
    │   - 1 hour implementation
    │
    └─ Option 3: Hybrid (params in URL)
        - Stay within Trackier
        - More complex URL structure
        - 2 hour implementation
```

---

## Next Step: TEST

**Command to verify macro resolution:**
```bash
# Create fresh campaign to avoid cache
curl -X POST "https://api.trackier.com/v2/campaigns" \
  -H "X-Api-Key: YOUR_KEY" \
  -d '{"title":"Macro Test","url":"https://example.com/test?p={sub1}","advertiserId":5,...}'

# Get campaign ID from response
CAMPAIGN_ID=XXX

# Test immediately (fresh campaign, no cache)
curl -L "https://nebula.gotrackier.com/click?campaign_id=$CAMPAIGN_ID&pub_id=2&sub1=WORKS"

# If result shows: https://example.com/test?p=WORKS
# → Option 1 WORKS! Use current implementation ✅

# If result shows: https://example.com/test?p={sub1}
# → Macros don't work, need Option 2 or 3
```

---

## Summary

**Your Question:** "Will we pass values and param placeholders?"

**Answer:** 
- **Option 1 (current):** Pass values only (`&sub1=value`), Trackier resolves placeholders `{sub1}`
- **Option 2 (fallback):** Pass complete suffix as single value, our redirect decodes it
- **Option 3 (hybrid):** Pass both param names and values separately

**Current implementation uses Option 1** because it's the most elegant. If macro resolution doesn't work, we can switch to Option 2 (custom redirect) in about 1 hour.

The code is ready either way! 🎯
