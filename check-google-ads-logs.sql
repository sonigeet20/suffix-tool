-- Query to check Google Ads silent fetch activity and analyze IPs

-- 1. Check recent silent fetch stats (last 24 hours)
SELECT 
    offer_name,
    client_country,
    client_ip,
    fetch_date,
    created_at,
    -- Check if IP looks like a real user or bot/datacenter
    CASE 
        WHEN client_ip LIKE '66.249.%' THEN 'Google Bot'
        WHEN client_ip LIKE '157.55.%' THEN 'Bing Bot'
        WHEN client_ip LIKE '172.%' OR client_ip LIKE '10.%' OR client_ip LIKE '192.168.%' THEN 'Private IP'
        ELSE 'Likely Real User'
    END as ip_type
FROM google_ads_silent_fetch_stats
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;

-- 2. Count clicks by IP type
SELECT 
    CASE 
        WHEN client_ip LIKE '66.249.%' THEN 'Google Bot'
        WHEN client_ip LIKE '157.55.%' THEN 'Bing Bot'
        WHEN client_ip LIKE '172.%' OR client_ip LIKE '10.%' OR client_ip LIKE '192.168.%' THEN 'Private IP'
        ELSE 'Likely Real User'
    END as ip_type,
    COUNT(*) as click_count,
    COUNT(DISTINCT client_ip) as unique_ips,
    COUNT(DISTINCT offer_name) as offers_clicked
FROM google_ads_silent_fetch_stats
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY ip_type
ORDER BY click_count DESC;

-- 3. Check which offers have silent fetch enabled and their activity
SELECT 
    sfs.offer_name,
    COUNT(*) as total_clicks,
    COUNT(DISTINCT sfs.client_ip) as unique_ips,
    COUNT(DISTINCT sfs.client_country) as countries,
    MIN(sfs.created_at) as first_click,
    MAX(sfs.created_at) as last_click
FROM google_ads_silent_fetch_stats sfs
WHERE sfs.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY sfs.offer_name
ORDER BY total_clicks DESC;

-- 4. Show sample of actual IPs with user agent info (if logged)
SELECT 
    offer_name,
    client_ip,
    client_country,
    created_at
FROM google_ads_silent_fetch_stats
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 5. Check if we have any user_agent or referrer data logged
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'google_ads_silent_fetch_stats'
ORDER BY ordinal_position;
