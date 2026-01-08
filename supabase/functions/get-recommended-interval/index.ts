import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Configuration constants
const BASE_INTERVAL_MS = 5000;      // Fallback for fresh campaigns

// Default constraints (used if script doesn't provide them)
const DEFAULT_TARGET_AVERAGE_REPEATS = 5;
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_MAX_INTERVAL_MS = 30000;

// Helper to calculate yesterday's date in a given timezone and return UTC range
function getYesterdayUTCRange(timezone: string): { startUTC: string; endUTC: string; localDate: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Get yesterday's date in the account's timezone
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const parts = formatter.formatToParts(yesterday);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const localDate = `${year}-${month}-${day}`;
    
    // Create midnight and end-of-day in the account's timezone
    // We do this by parsing the local date and comparing with UTC to find offset
    const localMidnight = new Date(`${year}-${month}-${day}T00:00:00`);
    const localEndOfDay = new Date(`${year}-${month}-${day}T23:59:59`);
    
    // Get what UTC time corresponds to midnight in the local timezone
    // by creating a formatter that shows UTC time for our local date
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    // Find the UTC time that equals midnight in the local timezone
    let testDate = new Date(yesterday);
    testDate.setUTCHours(0, 0, 0, 0);
    
    // Iterate to find when local time matches our target date at 00:00
    let found = false;
    for (let offset = -12; offset <= 14 && !found; offset++) {
      const testUTC = new Date(yesterday);
      testUTC.setUTCHours(-offset, 0, 0, 0); // Subtract offset to go backwards
      
      const localParts = formatter.formatToParts(testUTC);
      const testYear = localParts.find(p => p.type === 'year')?.value;
      const testMonth = localParts.find(p => p.type === 'month')?.value;
      const testDay = localParts.find(p => p.type === 'day')?.value;
      
      if (`${testYear}-${testMonth}-${testDay}` === localDate) {
        testDate = testUTC;
        found = true;
        break;
      }
    }
    
    // Calculate end time (add 24 hours)
    const endUTC = new Date(testDate);
    endUTC.setUTCHours(endUTC.getUTCHours() + 24);
    
    const startUTCStr = testDate.toISOString().split('.')[0] + 'Z';
    const endUTCStr = endUTC.toISOString().split('.')[0] + 'Z';
    
    return {
      startUTC: startUTCStr,
      endUTC: endUTCStr,
      localDate
    };
  } catch (e) {
    // Fallback to UTC
    console.warn(`⚠️ Invalid timezone or calculation error: ${e}, using UTC`);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const localDate = yesterday.toISOString().split('T')[0];
    
    return {
      startUTC: `${localDate}T00:00:00Z`,
      endUTC: `${localDate}T23:59:59Z`,
      localDate
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const offerName = url.searchParams.get('offer_name');
    const accountId = url.searchParams.get('account_id');

    if (!offerName) {
      return new Response(
        JSON.stringify({ error: 'offer_name parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📊 [get-recommended-interval] Processing offer: ${offerName}, account: ${accountId || 'none'}`);

    // 1. Get offer by name
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id')
      .eq('offer_name', offerName)
      .eq('is_active', true)
      .maybeSingle();

    if (offerError) {
      console.error('❌ Error fetching offer:', offerError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: offerError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!offer) {
      console.warn(`⚠️ Offer not found: ${offerName}`);
      return new Response(
        JSON.stringify({ 
          recommended_interval_ms: BASE_INTERVAL_MS,
          yesterday_clicks: 0,
          yesterday_landing_pages: 0,
          average_repeats: 0,
          used_default_fallback: true,
          reason: 'offer_not_found'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Parse request body for clicks, landing pages, timezone, and constraints
    let yesterdayClicks = 0;
    let yesterdayLandingPages = 0;
    let accountTimezone = 'UTC';
    let minIntervalMs = DEFAULT_MIN_INTERVAL_MS;
    let maxIntervalMs = DEFAULT_MAX_INTERVAL_MS;
    let targetAverageRepeats = DEFAULT_TARGET_AVERAGE_REPEATS;
    let defaultIntervalMs = BASE_INTERVAL_MS;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        yesterdayClicks = body.yesterday_total_clicks || 0;
        yesterdayLandingPages = body.yesterday_unique_landing_pages || 0;
        accountTimezone = body.account_timezone || 'UTC';
        
        // Accept constraints from script (script-level settings take priority)
        if (body.min_interval_ms !== undefined) minIntervalMs = body.min_interval_ms;
        if (body.max_interval_ms !== undefined) maxIntervalMs = body.max_interval_ms;
        if (body.target_average_repeats !== undefined) targetAverageRepeats = body.target_average_repeats;
        if (body.default_interval_ms !== undefined) defaultIntervalMs = body.default_interval_ms;
        
        console.log(`📬 POST data: clicks=${yesterdayClicks}, landing_pages=${yesterdayLandingPages}, timezone=${accountTimezone}`);
        console.log(`⚙️  Script constraints: MIN=${minIntervalMs}ms, MAX=${maxIntervalMs}ms, TARGET=${targetAverageRepeats}, DEFAULT=${defaultIntervalMs}`);
      } catch (e) {
        console.warn('⚠️ Failed to parse POST body');
      }
    }

    // 3. Calculate today's date in account timezone (for cache key)
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: accountTimezone }); // YYYY-MM-DD
    console.log(`📅 Today's date in ${accountTimezone}: ${todayDate}`);

    // 4. Check if we already calculated interval for today (CACHE CHECK)
    const { data: cachedInterval, error: cacheError } = await supabase
      .from('daily_trace_counts')
      .select('interval_used_ms, updated_at')
      .eq('offer_id', offer.id)
      .eq('account_id', accountId || '')
      .eq('date', todayDate)
      .maybeSingle();

    if (cachedInterval && cachedInterval.interval_used_ms) {
      console.log(`✅ [CACHE HIT] Using cached interval for ${todayDate}: ${cachedInterval.interval_used_ms}ms`);
      console.log(`   Cached at: ${cachedInterval.updated_at}`);
      
      return new Response(
        JSON.stringify({
          recommended_interval_ms: cachedInterval.interval_used_ms,
          yesterday_interval_ms: cachedInterval.interval_used_ms,
          yesterday_clicks: yesterdayClicks,
          yesterday_landing_pages: yesterdayLandingPages,
          average_repeats: yesterdayLandingPages > 0 ? parseFloat((yesterdayClicks / yesterdayLandingPages).toFixed(2)) : 0,
          min_interval_ms: minIntervalMs,
          max_interval_ms: maxIntervalMs,
          target_average_repeats: targetAverageRepeats,
          data_source: 'cache',
          used_default_fallback: false,
          account_id: accountId,
          account_timezone: accountTimezone,
          cached_date: todayDate,
          cached_at: cachedInterval.updated_at,
          message: 'Using cached interval calculated earlier today'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`⚠️ [CACHE MISS] No cached interval found for ${todayDate}, calculating new...`);

    // 5. Calculate yesterday's date for querying previous interval
    const { startUTC, endUTC, localDate: yesterdayDate } = getYesterdayUTCRange(accountTimezone);
    console.log(`📅 Yesterday's date: ${yesterdayDate}`);

    // 6. Get yesterday's interval from daily_trace_counts (for iterative calculation)
    const { data: yesterdayData, error: yesterdayError } = await supabase
      .from('daily_trace_counts')
      .select('interval_used_ms')
      .eq('offer_id', offer.id)
      .eq('account_id', accountId || '')
      .eq('date', yesterdayDate)
      .maybeSingle();

    let yesterdayInterval = BASE_INTERVAL_MS;
    if (yesterdayData && yesterdayData.interval_used_ms) {
      yesterdayInterval = yesterdayData.interval_used_ms;
      console.log(`✅ Found yesterday's interval: ${yesterdayInterval}ms`);
    } else {
      console.log(`⚠️ No yesterday interval found, using base: ${BASE_INTERVAL_MS}ms`);
    }

    // 7. Calculate interval based on average repeats per landing page
    // Formula: average_repeats = clicks / unique_landing_pages
    // If average > target, increase delay (slow down)
    // If average < target, decrease delay (speed up)
    let recommendedInterval = BASE_INTERVAL_MS;
    let averageRepeats = 0;
    let usedFallback = false;

    if (yesterdayClicks > 0 && yesterdayLandingPages > 0) {
      averageRepeats = yesterdayClicks / yesterdayLandingPages;
      const calculated = Math.round(yesterdayInterval * (targetAverageRepeats / averageRepeats));
      const adjusted = averageRepeats < targetAverageRepeats ? Math.min(yesterdayInterval, calculated) : calculated;
      recommendedInterval = Math.max(minIntervalMs, Math.min(maxIntervalMs, adjusted));
      
      console.log(`📊 Calculation:`);
      console.log(`   Clicks: ${yesterdayClicks}`);
      console.log(`   Unique Landing Pages: ${yesterdayLandingPages}`);
      console.log(`   Average Repeats: ${yesterdayClicks}/${yesterdayLandingPages} = ${averageRepeats.toFixed(2)}`);
      console.log(`   Yesterday Interval: ${yesterdayInterval}ms`);
      console.log(`   Formula: ${yesterdayInterval} * (${targetAverageRepeats}/${averageRepeats.toFixed(2)}) = ${calculated}ms`);
      console.log(`   Final (clamped to MIN=${minIntervalMs}, MAX=${maxIntervalMs}): ${recommendedInterval}ms`);
    } else {
      usedFallback = true;
      // Day-0 or no-data: use script-provided default, clamped to constraints
      recommendedInterval = Math.max(minIntervalMs, Math.min(maxIntervalMs, defaultIntervalMs));
      console.log(`⚠️ Not enough data for calculation, using default (clamped): ${recommendedInterval}ms [default=${defaultIntervalMs}, min=${minIntervalMs}, max=${maxIntervalMs}]`);
    }

    const response = {
      recommended_interval_ms: recommendedInterval,
      yesterday_interval_ms: yesterdayInterval,
      yesterday_clicks: yesterdayClicks,
      yesterday_landing_pages: yesterdayLandingPages,
      average_repeats: averageRepeats > 0 ? parseFloat(averageRepeats.toFixed(2)) : 0,
      min_interval_ms: minIntervalMs,
      max_interval_ms: maxIntervalMs,
      target_average_repeats: targetAverageRepeats,
      data_source: (yesterdayClicks > 0 && yesterdayLandingPages > 0) ? 'google_ads_report' : 'fallback',
      used_default_fallback: usedFallback,
      account_id: accountId,
      account_timezone: accountTimezone,
      stats_date: yesterdayDate,
      formula: {
        description: 'next = yesterday_interval * (target / average_repeats) where average_repeats = clicks / unique_landing_pages',
        target_average_repeats: targetAverageRepeats,
        min_interval_ms: minIntervalMs,
        max_interval_ms: maxIntervalMs,
        base_interval_ms: BASE_INTERVAL_MS,
        default_interval_ms: defaultIntervalMs
      }
    };

    console.log(`✅ Response: interval=${recommendedInterval}ms, fallback=${usedFallback}`);

    // Store today's calculated interval for caching (so future calls today return same value)
    try {
      const { error: storeError } = await supabase
        .from('daily_trace_counts')
        .upsert({
          offer_id: offer.id,
          account_id: accountId || '',
          date: todayDate,
          trace_count: 0, // Not tracking traces anymore, using Google Ads data
          interval_used_ms: recommendedInterval,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'offer_id,account_id,date'
        });
      
      if (storeError) {
        console.warn('⚠️ Failed to cache today\'s interval:', storeError.message);
      } else {
        console.log(`✅ Cached interval ${recommendedInterval}ms for ${todayDate}`);
      }
    } catch (e: any) {
      console.warn('⚠️ Error caching interval:', e.message);
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message,
        recommended_interval_ms: BASE_INTERVAL_MS,
        used_default_fallback: true
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
