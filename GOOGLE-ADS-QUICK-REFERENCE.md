# Google Ads Click Tracker - Quick Reference

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Apply database migration
supabase db push supabase/migrations/20260128_google_ads_click_tracker.sql

# 2. Deploy edge functions
supabase functions deploy get-suffix-geo
supabase functions deploy fill-geo-buckets

# 3. Enable feature
psql $DB_URL -c "UPDATE settings SET google_ads_enabled=true, tracking_domains='[\"ads.day24.online\"]';"

# 4. Enable for offer
psql $DB_URL -c "UPDATE offers SET google_ads_config='{\"enabled\":true}' WHERE offer_name='YOUR_OFFER';"

# 5. Fill buckets
curl -X POST $SUPABASE_URL/functions/v1/fill-geo-buckets \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"offer_name":"YOUR_OFFER"}'

# 6. Use this template in Google Ads:
# https://ads.day24.online/click?offer_name=YOUR_OFFER&force_transparent=true&url={lpurl}
```

---

## 📁 Files Created

```
supabase/migrations/
  ├── 20260128_google_ads_click_tracker.sql         # Schema
  └── 20260128_google_ads_click_tracker_rollback.sql # Undo

supabase/functions/
  ├── get-suffix-geo/index.ts      # Generate geo suffixes
  ├── fill-geo-buckets/index.ts    # Bulk bucket fill
  └── cleanup-geo-buckets/index.ts # Maintenance

proxy-service/routes/
  └── google-ads-click.js          # /click endpoint (optional)

src/components/
  └── GoogleAdsModal.tsx           # UI component (optional)

Documentation/
  ├── GOOGLE-ADS-ROLLBACK.md       # How to undo everything
  ├── GOOGLE-ADS-INTEGRATION.md    # Step-by-step setup
  └── GOOGLE-ADS-IMPLEMENTATION-SUMMARY.md # Complete overview
```

---

## 🎛️ Control Panel (SQL)

### Enable/Disable Globally
```sql
-- Enable
UPDATE settings SET google_ads_enabled = TRUE;

-- Disable (instant rollback)
UPDATE settings SET google_ads_enabled = FALSE;
```

### Configure Offer
```sql
-- Enable with options
UPDATE offers 
SET google_ads_config = '{
  "enabled": true,
  "max_traces_per_day": 1000,
  "apply_filters": false,
  "single_geo_targets": ["US", "GB", "ES"],
  "multi_geo_targets": ["US,GB,ES"]
}'
WHERE offer_name = 'YOUR_OFFER';

-- Disable offer
UPDATE offers 
SET google_ads_config = jsonb_set(google_ads_config, '{enabled}', 'false')
WHERE offer_name = 'YOUR_OFFER';
```

### Add Tracking Domain
```sql
UPDATE settings 
SET tracking_domains = tracking_domains || '["new-domain.com"]'::jsonb;
```

---

## 📊 Monitoring Queries

### Bucket Health
```sql
SELECT 
  offer_name,
  target_country,
  COUNT(*) FILTER (WHERE NOT is_used) as available,
  COUNT(*) FILTER (WHERE is_used) as used
FROM geo_suffix_buckets
GROUP BY offer_name, target_country
ORDER BY available ASC;
```

### Today's Clicks
```sql
SELECT * FROM google_ads_click_stats 
WHERE click_date = CURRENT_DATE
ORDER BY clicks_today DESC;
```

### Low Buckets Alert
```sql
SELECT offer_name, target_country, COUNT(*) as available
FROM geo_suffix_buckets
WHERE NOT is_used
GROUP BY offer_name, target_country
HAVING COUNT(*) < 5;
```

---

## 🔧 Common Operations

### Fill Buckets
```bash
curl -X POST $SUPABASE_URL/functions/v1/fill-geo-buckets \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_name": "YOUR_OFFER",
    "single_geo_targets": ["US", "GB", "ES"],
    "multi_geo_targets": ["US,GB,ES"],
    "single_geo_count": 30,
    "multi_geo_count": 10
  }'
```

### Cleanup Old Suffixes
```bash
curl -X POST $SUPABASE_URL/functions/v1/cleanup-geo-buckets \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "days_old": 7,
    "max_use_count": 1000,
    "dry_run": false
  }'
```

### Get Bucket Stats
```sql
SELECT * FROM get_bucket_stats('YOUR_OFFER');
```

### Test Click
```bash
curl -I "https://ads.day24.online/click?offer_name=YOUR_OFFER&force_transparent=true&url=https://example.com"
# Should return 302 redirect
```

---

## ⚡ Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Redirect Time | <50ms | >100ms |
| Bucket Available | 10+ | <5 |
| Success Rate | >99% | <95% |
| Trace Time | <3s | >5s |

---

## 🚨 Emergency Procedures

### Instant Disable
```sql
UPDATE settings SET google_ads_enabled = FALSE;
```

### Disable Specific Offer
```sql
UPDATE offers 
SET google_ads_config = jsonb_set(google_ads_config, '{enabled}', 'false')
WHERE offer_name = 'PROBLEM_OFFER';
```

### Check What's Enabled
```sql
SELECT offer_name, google_ads_config->>'enabled' as enabled
FROM offers 
WHERE google_ads_config->>'enabled' = 'true';
```

---

## 🔄 Rollback Levels

### Level 1: Disable (0 downtime, instant)
```sql
UPDATE settings SET google_ads_enabled = FALSE;
```

### Level 2: Remove Route (requires restart)
Remove from server.js:
```javascript
// Delete these lines:
const googleAdsClickHandler = require('./routes/google-ads-click');
app.get('/click', googleAdsClickHandler.handleClick);
```

### Level 3: Delete Functions
```bash
rm -rf supabase/functions/{get-suffix-geo,fill-geo-buckets,cleanup-geo-buckets}
```

### Level 4: Database Rollback
```bash
psql $DB_URL -f supabase/migrations/20260128_google_ads_click_tracker_rollback.sql
```

See **GOOGLE-ADS-ROLLBACK.md** for detailed instructions.

---

## 📋 Pre-Flight Checklist

Before enabling in production:

- [ ] Database migration applied
- [ ] Edge functions deployed
- [ ] Settings configured (domains, enabled)
- [ ] Test offer configured
- [ ] Buckets filled (30+ per geo)
- [ ] DNS pointing to NLB
- [ ] SSL certificate active
- [ ] Test redirect works
- [ ] Stats recording
- [ ] Monitoring set up
- [ ] Rollback plan reviewed

---

## 🔗 Template URL Format

```
https://{domain}/click?offer_name={OFFER_NAME}&force_transparent=true&url={lpurl}
```

**Example:**
```
https://ads.day24.online/click?offer_name=PRIMERITI_ES_SHEET_MOB&force_transparent=true&url={lpurl}
```

Paste into Google Ads → Final URL

---

## 📞 Support

- **Rollback Guide:** GOOGLE-ADS-ROLLBACK.md
- **Integration Steps:** GOOGLE-ADS-INTEGRATION.md
- **Full Documentation:** GOOGLE-ADS-IMPLEMENTATION-SUMMARY.md

---

## ✅ Success Indicators

Working correctly when:
- ✅ Click redirects to landing page with suffix
- ✅ Suffix format: `s=ABC123...`
- ✅ Redirect time < 50ms
- ✅ Buckets refill after clicks
- ✅ Stats show in google_ads_click_stats table
- ✅ No errors in logs

---

## 🐛 Quick Troubleshooting

**"Feature disabled"**
```sql
UPDATE settings SET google_ads_enabled = TRUE;
```

**"Offer not found"**
```sql
UPDATE offers SET google_ads_config = '{"enabled": true}' WHERE offer_name = 'YOUR_OFFER';
```

**"No suffix available"**
```bash
curl -X POST .../fill-geo-buckets -d '{"offer_name":"YOUR_OFFER"}'
```

**"Domain not configured"**
```sql
UPDATE settings SET tracking_domains = '["ads.day24.online"]';
```

---

## 📈 Scaling Guide

| Daily Clicks | Bucket Size | Refill Strategy |
|--------------|-------------|-----------------|
| <100 | 10-20 | Manual/Weekly |
| 100-1000 | 20-30 | Cron/Daily |
| 1000-10000 | 30-50 | Cron/6-hour |
| 10000+ | 50-100 | On-demand |

---

## 🔍 Useful Queries

### All Enabled Offers
```sql
SELECT offer_name, google_ads_config 
FROM offers 
WHERE google_ads_config->>'enabled' = 'true';
```

### Bucket Summary
```sql
SELECT 
  COUNT(DISTINCT offer_name) as offers,
  COUNT(DISTINCT target_country) as countries,
  COUNT(*) as total_suffixes,
  COUNT(*) FILTER (WHERE NOT is_used) as available,
  COUNT(*) FILTER (WHERE is_used) as used
FROM geo_suffix_buckets;
```

### Recent Clicks
```sql
SELECT * FROM google_ads_click_stats 
ORDER BY updated_at DESC 
LIMIT 10;
```

---

## 📝 Quick Notes

- Feature disabled by default (safe to deploy)
- All changes are additive (zero breaking changes)
- Can be rolled back instantly via settings
- Full rollback available via migration
- No existing code modifications required
- Optional integrations for convenience only

---

**Version:** 1.0  
**Last Updated:** January 28, 2026  
**Status:** ✅ Production Ready
