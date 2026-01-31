import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { offer_name, trace_override_enabled, trace_speed_multiplier, base_interval_ms } = body;

    if (!offer_name) {
      return new Response(
        JSON.stringify({ error: 'Missing offer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[TRACE-SCHEDULER] Processing ${offer_name}:`, { 
      trace_override_enabled, 
      trace_speed_multiplier, 
      base_interval_ms 
    });

    // If override not enabled, return (default behavior)
    if (!trace_override_enabled) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'skip', 
          reason: 'override_disabled' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch override settings
    const { data: override } = await supabase
      .from('v5_trace_overrides')
      .select('*')
      .eq('offer_name', offer_name)
      .maybeSingle();

    if (!override) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'skip', 
          reason: 'no_override_found' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check: UTC midnight reset needed?
    const today = new Date().toISOString().split('T')[0];
    if (override.last_trace_reset_utc !== today) {
      console.log(`[TRACE-SCHEDULER] ${offer_name}: Resetting counter (was ${override.last_trace_reset_utc}, now ${today})`);
      await supabase
        .from('v5_trace_overrides')
        .update({
          traces_count_today: 0,
          last_trace_reset_utc: today
        })
        .eq('offer_name', offer_name);
      
      override.traces_count_today = 0;
      override.last_trace_reset_utc = today;
    }

    // Check: Daily limit reached?
    if (override.traces_per_day && override.traces_count_today >= override.traces_per_day) {
      console.log(`[TRACE-SCHEDULER] ${offer_name}: Daily limit reached (${override.traces_count_today}/${override.traces_per_day})`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'skip', 
          reason: 'daily_limit_reached',
          traces_count_today: override.traces_count_today,
          traces_per_day: override.traces_per_day
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check: Has interval elapsed since last trace?
    const speedMultiplier = trace_speed_multiplier || override.trace_speed_multiplier || 1.0;
    const baseInterval = base_interval_ms || 60000;  // Default 60 seconds
    const controlledInterval = Math.round(baseInterval / speedMultiplier);

    if (!override.last_trace_time) {
      console.log(`[TRACE-SCHEDULER] ${offer_name}: First trace (no last_trace_time)`);
    } else {
      const lastTraceMs = new Date(override.last_trace_time).getTime();
      const nowMs = new Date().getTime();
      const elapsedMs = nowMs - lastTraceMs;

      if (elapsedMs < controlledInterval) {
        console.log(`[TRACE-SCHEDULER] ${offer_name}: Interval not elapsed (${elapsedMs}ms < ${controlledInterval}ms)`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            action: 'skip', 
            reason: 'interval_not_elapsed',
            elapsed_ms: elapsedMs,
            required_ms: controlledInterval
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // All checks passed: Trigger trace
    console.log(`[TRACE-SCHEDULER] ${offer_name}: Triggering trace (${override.traces_count_today + 1}/${override.traces_per_day || 'unlimited'})`);

    // Call get-suffix edge function
    try {
      const traceUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offer_name)}`;
      const traceResp = await fetch(traceUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${supabaseKey}` }
      });

      if (traceResp.ok) {
        const traceData = await traceResp.json();
        if (traceData.success && traceData.suffix) {
          // Store to bucket (via edge function call or direct insert)
          console.log(`[TRACE-SCHEDULER] ${offer_name}: Trace successful, suffix: ${traceData.suffix.substring(0, 20)}...`);
          
          // Increment counter and update last_trace_time
          await supabase
            .from('v5_trace_overrides')
            .update({
              traces_count_today: override.traces_count_today + 1,
              last_trace_time: new Date().toISOString()
            })
            .eq('offer_name', offer_name);

          // Log to v5_trace_log
          await supabase.from('v5_trace_log').insert({
            offer_name,
            trace_result: 'success',
            suffix_generated: traceData.suffix,
            geo_pool_used: traceData.geo_pool_used || null
          }).catch(() => {});

          return new Response(
            JSON.stringify({ 
              success: true, 
              action: 'trace_triggered',
              suffix: traceData.suffix.substring(0, 20),
              traces_count_today: override.traces_count_today + 1
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Trace failed
      console.warn(`[TRACE-SCHEDULER] ${offer_name}: Trace failed (HTTP ${traceResp.status})`);
      await supabase.from('v5_trace_log').insert({
        offer_name,
        trace_result: 'failed',
        error_message: `HTTP ${traceResp.status}`
      }).catch(() => {});

      return new Response(
        JSON.stringify({ 
          success: false, 
          action: 'trace_failed',
          error: `HTTP ${traceResp.status}`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (traceError: any) {
      console.error(`[TRACE-SCHEDULER] ${offer_name}: Trace error:`, traceError.message);
      await supabase.from('v5_trace_log').insert({
        offer_name,
        trace_result: 'failed',
        error_message: traceError.message
      }).catch(() => {});

      return new Response(
        JSON.stringify({ 
          success: false, 
          action: 'trace_error',
          error: traceError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Trace scheduler error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
