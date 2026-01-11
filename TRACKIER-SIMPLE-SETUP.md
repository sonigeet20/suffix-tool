# Trackier Setup: Simple Explanation & Automation

## 🎯 What Needs to Happen (Simple Version)

### **Part 1: Manual (Must do in Trackier Dashboard)**
These 3 things CANNOT be automated - you must do them manually:

1. **Create Campaign 310** (Passthrough - catches the click)
2. **Create Campaign 309** (Final - sends user to landing page)
3. **Enable Webhook** (So we know when clicks happen)

**Why manual?** Trackier blocks automatic campaign creation for security.

---

### **Part 2: Automatic (Happens in URL Tracker UI)**
Everything else is automated:

✅ Save API key & configuration
✅ Extract parameters (gclid, fbclid, utm_source, etc.)
✅ Pass parameters through the redirect chain
✅ Store parameters in database
✅ Generate Google Ads template

---

## 📋 Step-by-Step (VERY Simple)

### **STEP 1: Generate URLs to Copy-Paste**

Run this helper to get ready-made URLs:

```bash
npm run trackier:generate-urls -- \
  --advertiser-id YOUR_ADVERTISER_ID \
  --final-url "https://www.elcorteingles.es/" \
  --publisher-id 2
```

This outputs two URLs:
- **URL for Campaign 310** (copy this)
- **URL for Campaign 309** (copy this)
- **Webhook URL** (copy this)

### **STEP 2: Go to Trackier Dashboard**

1. Create new campaign → paste Campaign 310 URL
2. Enable "Server Side Clicks" → paste Webhook URL
3. Create another campaign → paste Campaign 309 URL
4. Get the Campaign IDs (should be 310 and 309)

### **STEP 3: Come Back to URL Tracker**

Click **Trackier Setup button** → Enter:
- API Key
- Advertiser ID
- Campaign 310 ID
- Campaign 309 ID
- Your final landing page URL

Click **Create** ✅

### **STEP 4: Test**

Click the **Test** button → You'll see:
- ✅ Webhook is working
- ✅ Parameters are being extracted
- ✅ Everything is connected

---

## 🤖 Automated Features (What Happens Behind the Scenes)

```
When someone clicks your ad:

1. Trackier fires a webhook → Your server catches it
2. Server extracts: gclid, fbclid, utm_source, utm_campaign, etc.
3. Server injects parameters into Campaign 309 URL
4. Campaign 310 redirects → Campaign 309 → Landing page
5. All parameters are preserved through the chain
6. Database records all clicks and parameters
```

---

## 💡 What Each Step Does

| Step | Manual or Auto | What It Does |
|------|----------------|-------------|
| Create Campaign 310 | Manual | Entry point that catches clicks |
| Create Campaign 309 | Manual | Final step before landing page |
| Enable S2S Webhook | Manual | Tells Trackier to notify us of clicks |
| Save Config in UI | Auto | Stores API key and campaign IDs |
| Extract Parameters | Auto | Grabs gclid, fbclid, etc. from webhook |
| Pass Parameters | Auto | Injects params into Campaign 309 URL |
| Store in Database | Auto | Saves parameter data for reporting |
| Generate GA Template | Auto | Creates Google Ads tracking template |

---

## 🎁 Automation Provided

I've created `trackier-config-helper.ts` which automates:

### **1. URL Generation**
```typescript
const urls = generateTrackierURLs();
// Returns ready-to-copy URLs for both campaigns
```

### **2. Campaign Validation**
```typescript
const validation = await validateCampaignSetup(apiKey, advertiserId);
// Checks if campaigns 310 & 309 exist in Trackier
```

### **3. Configuration Save**
```typescript
await saveConfiguration(userId, offerId, config);
// Auto-saves to database - one click in the UI
```

### **4. Webhook Test**
```typescript
const test = await testWebhookConnectivity();
// Checks if webhook URL is reachable
```

### **5. Google Ads Template**
```typescript
const template = generateGoogleAdsTemplate();
// Auto-generates tracking template
```

### **6. Complete Setup**
```typescript
await runCompleteSetup({
  api_key: '...',
  advertiser_id: '...',
  final_landing_page: '...',
  campaign_310_id: '310',
  campaign_309_id: '309',
});
// Runs all steps in sequence
```

---

## 🚀 How to Use the Helper

### **Option A: Via Command Line**
```bash
npm run trackier:setup -- \
  --api-key sk_live_XXX \
  --advertiser-id 123456 \
  --final-url "https://www.elcorteingles.es/"
```

### **Option B: Via URL Tracker UI**
1. Click "Trackier Setup" button
2. Enter your details
3. Click "Generate URLs" → Copy to Trackier
4. Come back and click "Validate"
5. Done! ✅

### **Option C: Via TypeScript Code**
```typescript
import { runCompleteSetup } from './trackier-config-helper';

const result = await runCompleteSetup({
  user_id: 'user_123',
  offer_id: 'offer_123',
  api_key: 'sk_live_XXX',
  advertiser_id: '123456',
  final_landing_page: 'https://www.elcorteingles.es/',
  campaign_310_id: '310',
  campaign_309_id: '309',
});
```

---

## ⚡ Quick Reference

| Need | Solution |
|------|----------|
| Copy URL to Trackier | `generateTrackierURLs()` |
| Check if campaigns exist | `validateCampaignSetup()` |
| Save configuration | `saveConfiguration()` |
| Test webhook works | `testWebhookConnectivity()` |
| Get GA tracking template | `generateGoogleAdsTemplate()` |
| Do everything at once | `runCompleteSetup()` |

---

## ✅ Checklist

- [ ] Generated URLs using helper
- [ ] Created Campaign 310 in Trackier (with webhook enabled)
- [ ] Created Campaign 309 in Trackier
- [ ] Entered API key in URL Tracker
- [ ] Entered Campaign IDs in URL Tracker
- [ ] Clicked "Validate" - all green ✅
- [ ] Tested webhook - working ✅
- [ ] Copied tracking template to Google Ads
- [ ] Sent test click - parameters showing up ✅

---

## 🎯 Result

After these steps:
- ✅ Click on ad → Campaign 310 catches it
- ✅ Parameters extracted automatically
- ✅ Injected into Campaign 309 URL
- ✅ Redirected to landing page with all parameters
- ✅ Database records everything for analytics
- ✅ Google Ads tracking template in place

**Zero ongoing manual work.** Everything is automated after initial setup!
