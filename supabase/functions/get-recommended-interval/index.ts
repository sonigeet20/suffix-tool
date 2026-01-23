import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Configuration constants
const BASE_INTERVAL_MS = 5000;      // Fallback for fresh campaigns
const DEFAULT_BUDGET_MULTIPLIER = 10.0;  // Default call budget: yesterday_clicks × 10

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
    let targetRepeatRatio = 5;      // Target repeats per landing page (speedup)
    let minRepeatRatio = 1.0;       // Minimum repeats per landing page (slowdown trigger)
    let budgetMultiplier = DEFAULT_BUDGET_MULTIPLIER;  // Call budget multiplier (backward compatible)
    
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
        if (body.target_repeat_ratio !== undefined) targetRepeatRatio = body.target_repeat_ratio;
        if (body.min_repeat_ratio !== undefined) minRepeatRatio = body.min_repeat_ratio;
        if (body.call_budget_multiplier !== undefined) budgetMultiplier = body.call_budget_multiplier;
        
        console.log(`📬 POST data: clicks=${yesterdayClicks}, landing_pages=${yesterdayLandingPages}, timezone=${accountTimezone}`);
        console.log(`⚙️  Script constraints: MIN=${minIntervalMs}ms, MAX=${maxIntervalMs}ms, TARGET=${targetAverageRepeats}, DEFAULT=${defaultIntervalMs}`);
        console.log(`⚙️  Ratio constraints: TARGET=${targetRepeatRatio}:1 repeats/page, MIN=${minRepeatRatio}:1 repeats/page`);
        console.log(`⚙️  Budget multiplier: ${budgetMultiplier}x (from script or default)`);
      } catch (e) {
        console.warn('⚠️ Failed to parse POST body');
      }
    }

    // Preserve raw script-provided values (before overrides) for auditing
    const scriptMinInterval = minIntervalMs;
    const scriptMaxInterval = maxIntervalMs;
    const scriptTargetRepeatRatio = targetRepeatRatio;
    const scriptMinRepeatRatio = minRepeatRatio;
    const scriptBudgetMultiplier = budgetMultiplier;

    // 3. Calculate today's date in account timezone (for cache key)
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: accountTimezone }); // YYYY-MM-DD
    console.log(`📅 Today's date in ${accountTimezone}: ${todayDate}`);

    const hasData = yesterdayClicks > 0 && yesterdayLandingPages > 0;

    // If no data (day-0 or empty report), honor script default (clamped) and bypass cache
    if (!hasData) {
      const recommendedInterval = Math.max(minIntervalMs, Math.min(maxIntervalMs, defaultIntervalMs));
      console.log(`⚠️ [NO DATA] Using default (clamped): ${recommendedInterval}ms [default=${defaultIntervalMs}, min=${minIntervalMs}, max=${maxIntervalMs}]`);

      try {
        const { error: storeError } = await supabase
          .from('daily_trace_counts')
          .upsert({
            offer_id: offer.id,
            account_id: accountId || '',
            date: todayDate,
            trace_count: 0,
            total_clicks: yesterdayClicks,
            unique_landing_pages: yesterdayLandingPages,
            interval_used_ms: recommendedInterval,
            script_min_interval_ms: scriptMinInterval,
            script_max_interval_ms: scriptMaxInterval,
            script_target_repeat_ratio: scriptTargetRepeatRatio,
            script_min_repeat_ratio: scriptMinRepeatRatio,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'offer_id,account_id,date'
          });
        if (storeError) {
          console.warn('⚠️ Failed to cache default interval:', storeError.message);
        } else {
          console.log(`✅ Cached default interval ${recommendedInterval}ms for ${todayDate}`);
        }
      } catch (e: any) {
        console.warn('⚠️ Error caching default interval:', e.message);
      }

      return new Response(
        JSON.stringify({
          recommended_interval_ms: recommendedInterval,
          yesterday_interval_ms: recommendedInterval,
          yesterday_clicks: yesterdayClicks,
          yesterday_landing_pages: yesterdayLandingPages,
          average_repeats: 0,
          min_interval_ms: minIntervalMs,
          max_interval_ms: maxIntervalMs,
          target_average_repeats: targetAverageRepeats,
          data_source: 'default_no_data',
          used_default_fallback: true,
          account_id: accountId,
          account_timezone: accountTimezone,
          cached_date: todayDate,
          message: 'No data provided; using script default clamped to min/max'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Check if we already calculated interval for today (CACHE CHECK + OVERRIDES)
    const { data: cachedInterval, error: cacheError } = await supabase
      .from('daily_trace_counts')
      .select('interval_used_ms, updated_at, min_interval_override_ms, max_interval_override_ms, target_repeat_ratio, min_repeat_ratio, call_budget_multiplier, script_min_interval_ms, script_max_interval_ms, script_target_repeat_ratio, script_min_repeat_ratio')
      .eq('offer_id', offer.id)
      .eq('account_id', accountId || '')
      .eq('date', todayDate)
      .maybeSingle();

    // Apply overrides from database (takes precedence over script values)
    let budgetMultiplierSource = 'script';
    if (cachedInterval) {
      if (cachedInterval.min_interval_override_ms !== null && cachedInterval.min_interval_override_ms !== undefined) {
        minIntervalMs = cachedInterval.min_interval_override_ms;
        console.log(`✅ [OVERRIDE] Using database min_interval: ${minIntervalMs}ms (overriding script value)`);
      }
      if (cachedInterval.max_interval_override_ms !== null && cachedInterval.max_interval_override_ms !== undefined) {
        maxIntervalMs = cachedInterval.max_interval_override_ms;
        console.log(`✅ [OVERRIDE] Using database max_interval: ${maxIntervalMs}ms (overriding script value)`);
      }
      if (cachedInterval.target_repeat_ratio !== null && cachedInterval.target_repeat_ratio !== undefined) {
        targetRepeatRatio = cachedInterval.target_repeat_ratio;
        console.log(`✅ [OVERRIDE] Using database target_repeat_ratio: ${targetRepeatRatio} (overriding script value)`);
      }
      if (cachedInterval.min_repeat_ratio !== null && cachedInterval.min_repeat_ratio !== undefined) {
        minRepeatRatio = cachedInterval.min_repeat_ratio;
        console.log(`✅ [OVERRIDE] Using database min_repeat_ratio: ${minRepeatRatio} (overriding script value)`);
      }
      if (cachedInterval.call_budget_multiplier !== null && cachedInterval.call_budget_multiplier !== undefined) {
        budgetMultiplier = cachedInterval.call_budget_multiplier;
        budgetMultiplierSource = 'database';
        console.log(`✅ [OVERRIDE] Using database call_budget_multiplier: ${budgetMultiplier}x (overriding script value)`);
      }
    }
    
    // Log final budget multiplier source
    if (budgetMultiplierSource === 'script' && scriptBudgetMultiplier === DEFAULT_BUDGET_MULTIPLIER) {
      budgetMultiplierSource = 'default';
    }
    console.log(`💰 Final budget multiplier: ${budgetMultiplier}x (source: ${budgetMultiplierSource})`);

    if (cachedInterval && cachedInterval.interval_used_ms) {
      // Backfill or refresh script config columns even on cache hit so Interval History has data for all rows
      const scriptConfigChanged = (
        cachedInterval.script_min_interval_ms !== scriptMinInterval ||
        cachedInterval.script_max_interval_ms !== scriptMaxInterval ||
        cachedInterval.script_target_repeat_ratio !== scriptTargetRepeatRatio ||
        cachedInterval.script_min_repeat_ratio !== scriptMinRepeatRatio
      );

      if (scriptConfigChanged) {
        try {
          const { error: scriptUpdateError } = await supabase
            .from('daily_trace_counts')
            .update({
              script_min_interval_ms: scriptMinInterval,
              script_max_interval_ms: scriptMaxInterval,
              script_target_repeat_ratio: scriptTargetRepeatRatio,
              script_min_repeat_ratio: scriptMinRepeatRatio,
              updated_at: new Date().toISOString(),
            })
            .eq('offer_id', offer.id)
            .eq('account_id', accountId || '')
            .eq('date', todayDate);

          if (scriptUpdateError) {
            console.warn('⚠️ Failed to backfill script config on cache hit:', scriptUpdateError.message);
          } else {
            console.log('✅ Backfilled script config columns on cache hit');
          }
        } catch (scriptUpdateException: any) {
          console.warn('⚠️ Exception while backfilling script config on cache hit:', scriptUpdateException.message);
        }
      }

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

    // If no yesterday interval, use script default as base for calculation
    let yesterdayInterval = defaultIntervalMs;
    if (yesterdayData && yesterdayData.interval_used_ms) {
      yesterdayInterval = yesterdayData.interval_used_ms;
      console.log(`✅ Found yesterday's interval: ${yesterdayInterval}ms`);
    } else {
      console.log(`⚠️ No yesterday interval found, using script default as base: ${defaultIntervalMs}ms`);
    }
    console.log(`✅ Found yesterday's interval: ${yesterdayInterval}ms`);

    // 7. Calculate interval based on yesterday's interval with ratio adjustments, enforced by budget floor
    // Budget formula: maxDailyCalls = yesterdayClicks × budgetMultiplier
    // Budget floor: budgetInterval = 86400000 / maxDailyCalls (minimum allowed to not exceed budget)
    // Ratio adjustments: Apply to yesterdayInterval, then enforce budget floor
    let recommendedInterval = BASE_INTERVAL_MS;
    let averageRepeats = 0;
    let usedFallback = false;
    let adjustmentReason = 'default';
    let maxDailyCalls = 0;
    let budgetInterval = 0;

    if (yesterdayClicks > 0 && yesterdayLandingPages > 0) {
      averageRepeats = yesterdayClicks / yesterdayLandingPages;
      
      // Calculate budget floor (minimum interval to not exceed max daily calls)
      maxDailyCalls = Math.round(yesterdayClicks * budgetMultiplier);
      budgetInterval = Math.round(86400000 / maxDailyCalls); // 24 hours in ms
      
      console.log(`📊 Ratio-Based Calculation with Budget Safety Floor:`);
      console.log(`   Yesterday Interval: ${yesterdayInterval}ms (baseline for ratio adjustments)`);
      console.log(`   Yesterday Clicks: ${yesterdayClicks}`);
      console.log(`   Budget Multiplier: ${budgetMultiplier}x (source: ${budgetMultiplierSource})`);
      console.log(`   Max Daily Calls: ${maxDailyCalls} (${yesterdayClicks} × ${budgetMultiplier})`);
      console.log(`   Budget Floor: ${budgetInterval}ms (86400000 / ${maxDailyCalls}) - minimum allowed`);
      console.log(`   Unique Landing Pages: ${yesterdayLandingPages}`);
      console.log(`   Average Repeats: ${yesterdayClicks}/${yesterdayLandingPages} = ${averageRepeats.toFixed(2)}`);
      console.log(`   Target Ratio: ${targetRepeatRatio}:1 repeats/page`);
      console.log(`   Minimum Ratio: ${minRepeatRatio}:1 repeats/page`);
      
      let calculated = yesterdayInterval; // Start with yesterday's actual interval
      
      // SCENARIO 1: SPEEDUP - Ratio is above or at target (reduce interval = speed up)
      if (averageRepeats >= targetRepeatRatio) {
        calculated = Math.round(yesterdayInterval * (targetRepeatRatio / averageRepeats));
        adjustmentReason = 'speedup';
        console.log(`✅ SCENARIO 1 - SPEEDUP: ratio ${averageRepeats.toFixed(2)} >= target ${targetRepeatRatio}`);
        console.log(`   Raw Formula: ${yesterdayInterval} * (${targetRepeatRatio}/${averageRepeats.toFixed(2)}) = ${calculated}ms`);
      }
      // SCENARIO 2: STABLE - Ratio is between target and minimum (keep yesterday's speed)
      else if (averageRepeats >= minRepeatRatio) {
        calculated = yesterdayInterval;
        adjustmentReason = 'stable';
        console.log(`✅ SCENARIO 2 - STABLE: ratio ${averageRepeats.toFixed(2)} is between ${minRepeatRatio} and ${targetRepeatRatio}`);
        console.log(`   Keep yesterday's speed: ${yesterdayInterval}ms (NO CHANGE)`);
      }
      // SCENARIO 3: SLOWDOWN - Ratio is below minimum (increase interval = slow down)
      else {
        calculated = Math.round(yesterdayInterval * (minRepeatRatio / averageRepeats));
        adjustmentReason = 'slowdown';
        console.log(`⚠️  SCENARIO 3 - SLOWDOWN: ratio ${averageRepeats.toFixed(2)} < minimum ${minRepeatRatio}`);
        console.log(`   Formula: ${yesterdayInterval} * (${minRepeatRatio}/${averageRepeats.toFixed(2)}) = ${calculated}ms (SLOWER)`);
      }
      
      // ENFORCE BUDGET FLOOR: Never go below budget interval (which would exceed max daily calls)
      if (calculated < budgetInterval) {
        console.log(`   🚨 BUDGET ENFORCEMENT: ${calculated}ms would exceed ${maxDailyCalls} calls/day limit`);
        console.log(`   Enforcing budget floor: ${budgetInterval}ms`);
        calculated = budgetInterval;
        adjustmentReason = adjustmentReason + '_budget_enforced';
      } else {
        console.log(`   ✅ Within budget: ${calculated}ms will not exceed ${maxDailyCalls} calls/day`);
      }
      
      // Clamp to min/max constraints
      recommendedInterval = Math.max(minIntervalMs, Math.min(maxIntervalMs, calculated));
      
      if (recommendedInterval !== calculated) {
        console.log(`   ⚠️  Clamped to MIN=${minIntervalMs}, MAX=${maxIntervalMs}: ${recommendedInterval}ms`);
      } else {
        console.log(`   ✅ Within bounds: ${recommendedInterval}ms`);
      }
      
      console.log(`🎯 FINAL RESULT: ${recommendedInterval}ms (${adjustmentReason})`);
      console.log(`   Projected daily calls: ${Math.round(86400000 / recommendedInterval)} (budget limit: ${maxDailyCalls})`);
      console.log(`   Budget floor was: ${budgetInterval}ms (would make ${maxDailyCalls} calls/day)`);
      console.log(`   Yesterday baseline was: ${yesterdayInterval}ms`);
    } else {
      usedFallback = true;
      // Day-0 or no-data: use script-provided default, clamped to constraints
      recommendedInterval = Math.max(minIntervalMs, Math.min(maxIntervalMs, defaultIntervalMs));
      adjustmentReason = 'no_data';
      console.log(`⚠️ Not enough data for calculation, using default (clamped): ${recommendedInterval}ms [default=${defaultIntervalMs}, min=${minIntervalMs}, max=${maxIntervalMs}]`);
    }

    const response = {
      recommended_interval_ms: recommendedInterval,
      yesterday_interval_ms: yesterdayInterval,
      yesterday_clicks: yesterdayClicks,
      yesterday_landing_pages: yesterdayLandingPages,
      average_repeats: averageRepeats > 0 ? parseFloat(averageRepeats.toFixed(2)) : 0,
      adjustment_reason: adjustmentReason,
      call_budget_multiplier: budgetMultiplier,
      call_budget_multiplier_source: budgetMultiplierSource,
      daily_call_budget: maxDailyCalls,
      budget_interval_ms: budgetInterval,
      target_repeat_ratio: targetRepeatRatio,
      min_repeat_ratio: minRepeatRatio,
      min_interval_ms: minIntervalMs,
      max_interval_ms: maxIntervalMs,
      target_average_repeats: targetAverageRepeats,
      data_source: (yesterdayClicks > 0 && yesterdayLandingPages > 0) ? 'google_ads_report' : 'fallback',
      used_default_fallback: usedFallback,
      account_id: accountId,
      account_timezone: accountTimezone,
      stats_date: yesterdayDate,
      formula: {
        description: 'Ratio adjustments on yesterdayInterval with budget FLOOR enforcement. Budget prevents exceeding max daily calls, but does not set baseline pace.',
        budget_formula: 'maxDailyCalls = yesterdayClicks × budgetMultiplier, budgetInterval = 86400000 / maxDailyCalls (FLOOR only)',
        adjustment_baseline: 'yesterdayInterval (or default) is the baseline for all ratio adjustments',
        budget_enforcement: 'finalInterval = max(budgetInterval, calculated) - applied AFTER ratio adjustments as safety floor',
        scenario_1_speedup: 'calculated = yesterdayInterval * (target / ratio) when ratio >= target',
        scenario_2_stable: 'calculated = yesterdayInterval (no change) when min <= ratio < target',
        scenario_3_slowdown: 'calculated = yesterdayInterval * (min / ratio) when ratio < min',
        call_budget_multiplier: budgetMultiplier,
        target_repeat_ratio: targetRepeatRatio,
        min_repeat_ratio: minRepeatRatio,
        min_interval_ms: minIntervalMs,
        max_interval_ms: maxIntervalMs,
        base_interval_ms: BASE_INTERVAL_MS,
        default_interval_ms: defaultIntervalMs
      }
    };

    console.log(`✅ Response: interval=${recommendedInterval}ms, fallback=${usedFallback}`);

    // Store today's calculated interval for caching (so future calls today return same value)
    // Also store script-provided configuration values for reference in Intervals view
    try {
      const { error: storeError } = await supabase
        .from('daily_trace_counts')
        .upsert({
          offer_id: offer.id,
          account_id: accountId || '',
          total_clicks: yesterdayClicks,
          unique_landing_pages: yesterdayLandingPages,
          date: todayDate,
          trace_count: 0, // Not tracking traces anymore, using Google Ads data
          interval_used_ms: recommendedInterval,
          script_min_interval_ms: scriptMinInterval,
          script_max_interval_ms: scriptMaxInterval,
          script_target_repeat_ratio: scriptTargetRepeatRatio,
          script_min_repeat_ratio: scriptMinRepeatRatio,
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
