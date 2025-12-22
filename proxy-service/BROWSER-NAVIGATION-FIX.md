# Browser Navigation Early Stop Fix

## Problem
Browser traces were stopping too early ("Early stop - no URL changes for 1.5s") and not capturing all redirect steps, especially JavaScript-based redirects that execute after page load.

## Root Cause
1. **Too short idle timeout**: 1.5s wasn't enough for delayed JavaScript redirects
2. **No JS redirect detection**: Pages with `setTimeout` redirects (2-3s delays) were missed
3. **Race condition**: Early stop timer won races against JavaScript execution

## Solution Applied

### 1. Increased Idle Timeout
- **Browser mode**: 1.5s → 5s
- **Anti-cloaking mode**: 2s → 5s
- This gives JavaScript redirects time to execute

### 2. Added JavaScript Redirect Detection
After page loads, we now check for:
- `window.location` references
- `location.href` assignments
- `location.replace()` calls
- `setTimeout` + "redirect" patterns

If detected, we wait an additional 3 seconds for the redirect to execute.

### 3. Increased Post-Load Wait Time
- **Browser mode**: 500ms → 1000ms initial wait
- **Anti-cloaking**: 500ms → 1000ms initial wait
- Plus random jitter for anti-detection

## Changes Made

### File: `server.js`

#### Browser Mode (traceRedirectsBrowser)
- **Line 788-790**: Changed idle timeout from 1.5s to 5s
- **Line 795**: Changed check interval from 300ms to 500ms
- **Line 806**: Increased wait from 500ms to 1000ms
- **Lines 808-824**: Added JavaScript redirect detection

#### Anti-Cloaking Mode (traceRedirectsAntiCloaking)
- **Line 1127**: Changed idle timeout from 2s to 5s
- **Line 1143**: Increased wait from 500ms to 1000-2000ms
- **Lines 1145-1161**: Added JavaScript redirect detection

## Deploy Instructions

### Quick Deploy
```bash
cd proxy-service
./fix-early-stop.sh YOUR_EC2_IP
```

### Manual Deploy
```bash
# Upload fixed file
scp server.js ec2-user@YOUR_EC2_IP:/home/ec2-user/proxy-service/server.js

# Restart service
ssh ec2-user@YOUR_EC2_IP "pm2 restart proxy-service"

# View logs
ssh ec2-user@YOUR_EC2_IP "pm2 logs proxy-service"
```

## Expected Results

### Before Fix
```
info: ⚡ Browser: Early stop - no URL changes for 1.5s
info: ✅ Trace completed (browser): 1 steps in 2500ms
```
Only captures first page, misses JavaScript redirects.

### After Fix
```
info: 🔄 Detected JavaScript redirect code, waiting 3s more...
info: ⚡ Browser: Early stop - no URL changes for 5s
info: ✅ Trace completed (browser): 4 steps in 8500ms
```
Captures full redirect chain including delayed JavaScript redirects.

## Compatibility
- All try-catch blocks added to prevent "Execution context destroyed" errors
- Backward compatible with existing trace configurations
- No breaking changes to API response format

## Testing
Test with URLs that have:
1. Immediate HTTP redirects (302/301)
2. Meta refresh redirects
3. JavaScript redirects with `setTimeout` (1-5s delays)
4. Multiple redirect hops
5. Popup windows

All should now be captured in the chain.
