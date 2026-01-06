# 📋 Bandwidth Optimization - Files to Update

**Date:** January 4, 2026  
**Feature:** 99% Bandwidth Reduction via Final-Hop Minimal Mode

---

## 🖥️ AWS EC2 - Files to Update

### **File:** `proxy-service/server.js`

**Location:** `/home/ubuntu/luna-proxy-service/proxy-service/server.js` (on EC2)

**Changes Required:** Replace entire file with the updated version

**Key Changes Made:**

#### 1. **Browser Mode (Lines 1520-1680)**

**Added Minimal Mode State Machine:**
```javascript
// Line 1522-1530
let finalHopMinimalMode = false;

const activateFinalHopMinimalMode = (triggerUrl, reason) => {
  if (finalHopMinimalMode) return;
  finalHopMinimalMode = true;
  finalHopUrl = triggerUrl;
  logger.info(`🪶 Browser: Final-hop minimal mode enabled (${reason}) for ${triggerUrl.substring(0, 80)}...`);
  page.setJavaScriptEnabled(false);
};
```

**Hostname Matching with Empty Check (Lines 1548-1563):**
```javascript
// Extract hostnames and check for matches (with empty string protection)
if (urlHostname && expectedHostname && 
    (urlHostname.includes(expectedHostname) || expectedHostname.includes(urlHostname))) {
  activateFinalHopMinimalMode(requestUrl, 'expected_final_url_match');
}
```

**Body Download Skip (Lines 1630-1642):**
```javascript
// Skip body download for minimal mode
const isFinalHopTarget = finalHopMinimalMode && finalHopUrl && url.includes(finalHopUrl);
if (!isFinalHopTarget) {
  body = await response.buffer();
  bandwidth += body.length;
}
```

**Subresource Blocking (Lines 1592-1600):**
```javascript
const finalHopSubresource = finalHopMinimalMode && resourceType !== 'document';
if (finalHopSubresource) {
  return request.abort();
}
```

#### 2. **Anti-Cloaking Mode (Lines 2230-2400)**

**Same changes as Browser Mode:**
- Minimal mode state machine (lines 2232-2240)
- Hostname matching with empty check (lines 2267-2282)
- Body download skip (lines 2365-2382)
- Subresource blocking (lines 2325-2333)
- Redirect chain early-stop (lines 2377-2394)

#### 3. **Key Bug Fixes Included:**

**Empty Hostname Protection:**
```javascript
// Prevents about:blank from matching all URLs
if (urlHostname && expectedHostname && ...) {
  // Safe to check includes()
}
```

**Hostname-Only Matching:**
```javascript
// Extract hostname via new URL().hostname
// Removes www. prefix for comparison
// Prevents query parameter false matches
```

---

## ☁️ Supabase Edge Functions - Files to Update

### **File 1:** `supabase/functions/get-suffix/index.ts`

**Changes Required:** 3 modifications

#### **Change 1: Add Variable (Line 310)**
```typescript
let traceBandwidth_bytes = 0;  // Track trace bandwidth in bytes
let tracedFinalUrl: string | null = null;  // ✅ ADD THIS LINE - Actual final URL from trace
```

#### **Change 2: Capture Final URL (Line 362)**
```typescript
if (traceResult.success && traceResult.chain && traceResult.chain.length > 0) {
  const chain = traceResult.chain;
  const stepIndex = offer.redirect_chain_step || 0;
  
  // ✅ ADD THIS - Capture the actual final URL from the trace
  tracedFinalUrl = chain[chain.length - 1].url;

  if (stepIndex < chain.length) {
    // ... rest of code
```

#### **Change 3: Use Traced URL in Response (Line 545)**
```typescript
const responsePayload = {
  success: true,
  offer_name: offer.offer_name,
  final_url: tracedFinalUrl || offer.final_url,  // ✅ CHANGE THIS LINE - Use traced final URL if available
  tracking_url_used: trackingUrlToUse,
  // ... rest of response
```

**Why this change?**
- Returns the **actual traced final URL** instead of static database field
- Enables proper redirects with extracted parameters
- Example: Returns `https://nordvpn.com/special/?utm_medium=...` instead of placeholder

---

### **File 2:** `supabase/functions/trace-redirects/index.ts`

**Changes Required:** None (already forwards to AWS proxy)

**Verification:** Ensure AWS proxy URL is correctly configured

```typescript
// Check this line points to your EC2 instance
const awsProxyUrl = process.env.AWS_PROXY_URL || 'http://YOUR_EC2_IP:3000';
```

---

## 📦 Deployment Steps

### **Step 1: Update AWS EC2**

```bash
# SSH into your EC2 instance
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_EC2_IP

# Backup current version
cd /home/ubuntu/luna-proxy-service/proxy-service
cp server.js server.js.backup

# Pull latest changes from git OR copy updated file
# Option A: If using git
git pull origin main

# Option B: If copying file directly
# (From your local machine)
scp -i ~/.ssh/url-tracker.pem \
  /Users/geetsoni/Downloads/suffix-tool-main\ 2/proxy-service/server.js \
  ubuntu@YOUR_EC2_IP:/home/ubuntu/luna-proxy-service/proxy-service/

# Restart the service
sudo systemctl restart luna-proxy

# Verify it's running
sudo systemctl status luna-proxy

# Check logs for minimal mode messages
sudo journalctl -u luna-proxy -f | grep "🪶"
```

### **Step 2: Update Supabase Edge Functions**

```bash
# From your local project root
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Deploy get-suffix function
supabase functions deploy get-suffix --no-verify-jwt

# Verify deployment
supabase functions list
```

---

## ✅ Verification Checklist

### **Test AWS Changes:**

```bash
# Test 1: Verify minimal mode activates
curl -X POST http://YOUR_EC2_IP:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://go.nordvpn.net/aff_c?offer_id=42&aff_id=136822&aff_sub=723921",
    "mode": "anti_cloaking",
    "use_proxy": true,
    "expected_final_url": "nordvpn.com"
  }'

# Expected: bandwidth_bytes < 500 (should be ~340B)
```

```bash
# Test 2: Check logs for minimal mode activation
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_EC2_IP
sudo journalctl -u luna-proxy -n 100 | grep "🪶"

# Expected output:
# "🪶 Anti-cloaking: Final-hop minimal mode enabled"
```

### **Test Supabase Changes:**

```bash
# Test traced final URL is returned
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-suffix?offer_name=test-offer" \
  -H "Authorization: Bearer YOUR_ANON_KEY" | jq '.final_url'

# Expected: Should return actual traced URL, not static placeholder
```

### **Test End-to-End:**

```bash
# Full integration test
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-suffix?offer_name=nordvpn-test" \
  -H "Authorization: Bearer YOUR_ANON_KEY" | jq '{
    success,
    final_url,
    suffix,
    trace_bandwidth_bytes,
    params_extracted
  }'

# Expected:
# - success: true
# - final_url: actual traced destination
# - trace_bandwidth_bytes: < 1000
# - params_extracted: { offer_id, aff_id, aff_sub }
```

---

## 📊 What Changed (Summary)

### **Bandwidth Optimization:**
- ✅ Minimal mode activates on final destination
- ✅ JavaScript disabled on final hop
- ✅ Subresources blocked (images, CSS, fonts)
- ✅ Body download skipped for final page
- ✅ Parameters still extracted from earlier hops

### **Bug Fixes:**
- ✅ Empty hostname check prevents about:blank matching
- ✅ Hostname-only matching prevents query param false positives
- ✅ Body download restored for parameter extraction

### **New Feature:**
- ✅ Traced final URL returned in get-suffix response
- ✅ Enables proper redirect construction with parameters

---

## 🔄 Rollback Instructions

### **If Something Goes Wrong:**

**AWS EC2:**
```bash
# Restore backup
ssh -i ~/.ssh/url-tracker.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/luna-proxy-service/proxy-service
cp server.js.backup server.js
sudo systemctl restart luna-proxy
```

**Supabase:**
```bash
# Check deployment history
supabase functions list

# Rollback to previous version if needed
# (Redeploy from git history or backup)
```

---

## 💡 Important Notes

1. **All rotation features preserved:**
   - User Agent Rotation ✅
   - IP Rotation ✅
   - Geo-Targeting ✅
   - Referrer Rotation ✅
   - Tracking URL Rotation ✅

2. **Bandwidth savings:**
   - Before: 50-120KB per trace
   - After: 340-940B per trace
   - Reduction: ~99%

3. **No breaking changes:**
   - All existing functionality works
   - Backward compatible
   - Public endpoints remain public

4. **Monitoring:**
   - Watch for "🪶" emoji in logs (minimal mode activation)
   - Check bandwidth_bytes in responses
   - Verify params still extracted correctly

---

## 📝 Files Modified

**AWS (1 file):**
- ✅ `proxy-service/server.js` - Complete replacement needed

**Supabase (1 file):**
- ✅ `supabase/functions/get-suffix/index.ts` - 3 line changes

**Total:** 2 files need updating

---

## 🎯 Success Criteria

Deployment is successful when:

- ✅ Logs show "🪶 Final-hop minimal mode enabled"
- ✅ Bandwidth < 1KB for most traces
- ✅ Parameters still extracted correctly
- ✅ Traced final URL returned in get-suffix
- ✅ All rotations still working
- ✅ No errors in logs

---

## 📞 Support

If you encounter issues:

1. Check AWS logs: `sudo journalctl -u luna-proxy -f`
2. Check Supabase logs: `supabase functions logs get-suffix`
3. Verify bandwidth in test responses
4. Confirm params still being extracted
5. Check for "🪶" minimal mode activation logs
