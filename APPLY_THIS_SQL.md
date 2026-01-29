# Apply Click Analytics SQL Functions

## Instructions

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/rfhuqenntxiqurplenjn
2. Navigate to **SQL Editor** (left sidebar)
3. Create a **New Query**
4. Copy and paste the SQL below
5. Click **Run** (or press Ctrl/Cmd + Enter)

---

## SQL to Execute

```sql
-- Click Categorization Functions
-- Helps distinguish real users from Google bots and track redirect quality

-- Function to categorize a click as real user, google bot, or invalid
CREATE OR REPLACE FUNCTION categorize_click(
    p_user_agent TEXT,
    p_redirect_url TEXT
)
RETURNS TABLE (
    category TEXT,
    reason TEXT
) AS $$
BEGIN
  -- Check if Google bot
  IF p_user_agent ILIKE '%GoogleHypersonic%' OR p_user_agent ILIKE '%gzip(gfe)%' THEN
    RETURN QUERY SELECT 'google_bot'::TEXT, 'GoogleHypersonic user agent'::TEXT;
    RETURN;
  END IF;

  -- Check if redirect to Google verification endpoint
  IF p_redirect_url ILIKE '%google.com/asnc%' THEN
    RETURN QUERY SELECT 'google_bot'::TEXT, 'Redirected to google.com/asnc verification'::TEXT;
    RETURN;
  END IF;

  -- Check if macro not replaced
  IF p_redirect_url LIKE '%{lpurl%' THEN
    RETURN QUERY SELECT 'invalid'::TEXT, '{lpurl} macro not replaced'::TEXT;
    RETURN;
  END IF;

  -- Check if test URL
  IF p_redirect_url LIKE '%example.com%' THEN
    RETURN QUERY SELECT 'invalid'::TEXT, 'Test URL (example.com)'::TEXT;
    RETURN;
  END IF;

  -- Check if valid landing page
  IF p_redirect_url LIKE 'https://%' OR p_redirect_url LIKE 'http://%' THEN
    RETURN QUERY SELECT 'real_user'::TEXT, 'Valid landing page redirect'::TEXT;
    RETURN;
  END IF;

  -- Default: unknown
  RETURN QUERY SELECT 'invalid'::TEXT, 'Unknown redirect format'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get click statistics by category
CREATE OR REPLACE FUNCTION get_click_stats_by_category(
    p_offer_name TEXT DEFAULT NULL,
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    offer_name TEXT,
    total_clicks BIGINT,
    real_users BIGINT,
    google_bots BIGINT,
    invalid_clicks BIGINT,
    real_user_percentage NUMERIC,
    google_bot_percentage NUMERIC,
    real_user_conversions BIGINT,
    conversion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH categorized AS (
    SELECT 
      gace.offer_name,
      gace.id,
      gace.user_agent,
      gace.redirect_url,
      (categorize_click(gace.user_agent, gace.redirect_url)).category,
      gace.clicked_at
    FROM google_ads_click_events gace
    WHERE gace.clicked_at >= NOW() - (p_days || ' days')::INTERVAL
      AND (p_offer_name IS NULL OR gace.offer_name = p_offer_name)
  ),
  stats AS (
    SELECT 
      offer_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE category = 'real_user') as real_user_count,
      COUNT(*) FILTER (WHERE category = 'google_bot') as google_bot_count,
      COUNT(*) FILTER (WHERE category = 'invalid') as invalid_count,
      COUNT(*) FILTER (WHERE category = 'real_user' AND clicked_at::DATE = CURRENT_DATE) as today_real_users
    FROM categorized
    GROUP BY offer_name
  )
  SELECT 
    s.offer_name,
    s.total,
    s.real_user_count,
    s.google_bot_count,
    s.invalid_count,
    CASE WHEN s.total > 0 THEN (s.real_user_count::NUMERIC / s.total * 100)::NUMERIC(5,2) ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.google_bot_count::NUMERIC / s.total * 100)::NUMERIC(5,2) ELSE 0 END,
    s.today_real_users,
    CASE WHEN s.real_user_count > 0 THEN (s.today_real_users::NUMERIC / s.real_user_count * 100)::NUMERIC(5,2) ELSE 0 END
  FROM stats s
  ORDER BY s.total DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- View for easy dashboard querying
CREATE OR REPLACE VIEW click_analytics_dashboard AS
SELECT 
  gace.offer_name,
  (categorize_click(gace.user_agent, gace.redirect_url)).category as click_category,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE gace.suffix != '') as with_suffix,
  COUNT(*) FILTER (WHERE gace.blocked = true) as blocked_clicks,
  AVG(gace.response_time_ms) as avg_response_time,
  gace.clicked_at::DATE as click_date
FROM google_ads_click_events gace
GROUP BY gace.offer_name, (categorize_click(gace.user_agent, gace.redirect_url)).category, gace.clicked_at::DATE
ORDER BY gace.clicked_at::DATE DESC, gace.offer_name;
```

---

## Verify Installation

After running the SQL, verify it worked by running this test query:

```sql
SELECT * FROM get_click_stats_by_category('SURFSHARK_US_WW_SHEET_SMB', 7);
```

You should see output showing real_users, google_bots, and invalid_clicks counts.

---

## What This Does

✅ **categorize_click()** - Categorizes each click as:
- `real_user` - Valid clicks reaching affiliate landing pages
- `google_bot` - Google verification bots (GoogleHypersonic or google.com/asnc redirects)
- `invalid` - Test URLs or broken macro replacements

✅ **get_click_stats_by_category()** - Aggregates stats showing:
- Total clicks in last N days
- Real users count and percentage
- Google bots count and percentage  
- Invalid clicks count
- Conversion metrics

✅ **click_analytics_dashboard** - VIEW for easy querying and reporting

---

## Next Steps

After applying this SQL:
1. Open your frontend at http://localhost:5173
2. Click on any Google Ads offer (e.g., SURFSHARK_US_WW_SHEET_SMB)
3. You'll see the new "Click Analytics (7 Days)" section showing:
   - Real Users (green)
   - Google Bots (red)
   - Total Clicks (purple)
   - Invalid/Lost Clicks (amber)
