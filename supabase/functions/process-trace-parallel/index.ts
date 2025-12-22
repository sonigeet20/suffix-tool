import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TraceRequest {
  request_id: string;
  offer_id: string;
  tracking_url: string;
  target_country: string;
  inbound_params: Record<string, string>;
  referrer?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const traceRequest: TraceRequest = await req.json();
    const { request_id, offer_id, tracking_url, target_country, inbound_params, referrer } = traceRequest;

    console.log('🚀 Starting parallel trace for request:', request_id);

    const traceStartTime = Date.now();

    // Step 1: Lock an available IP from the pool
    console.log('🔒 Attempting to lock IP for country:', target_country);
    const { data: lockedIP, error: lockError } = await supabase
      .rpc('lock_available_ip', {
        p_country: target_country,
        p_request_id: request_id,
        p_lock_duration_seconds: 90
      });

    if (lockError || !lockedIP || lockedIP.length === 0) {
      console.error('❌ Failed to lock IP:', lockError);
      await supabase
        .from('active_trace_requests')
        .update({
          status: 'failed',
          error_message: 'No available IP in pool',
          completed_at: new Date().toISOString(),
        })
        .eq('request_id', request_id);

      return new Response(
        JSON.stringify({ success: false, error: 'No available IP' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ipInfo = lockedIP[0];
    console.log('✅ Locked IP:', ipInfo.ip_address, 'Provider:', ipInfo.provider);

    // Step 2: Update request status to processing
    await supabase
      .from('active_trace_requests')
      .update({
        status: 'processing',
        ip_assigned: ipInfo.ip_address,
        ip_locked_at: new Date().toISOString(),
      })
      .eq('request_id', request_id);

    // Step 3: Get offer settings and AWS proxy URL
    const { data: offer } = await supabase
      .from('offers')
      .select('user_id, tracer_mode, block_resources, extract_only')
      .eq('id', offer_id)
      .single();

    const { data: settings } = await supabase
      .from('settings')
      .select('aws_proxy_url')
      .eq('user_id', offer!.user_id)
      .maybeSingle();

    if (!settings?.aws_proxy_url) {
      console.error('❌ No AWS proxy URL configured');
      await supabase.rpc('release_ip', {
        p_ip_address: ipInfo.ip_address,
        p_success: false,
      });

      await supabase
        .from('active_trace_requests')
        .update({
          status: 'failed',
          error_message: 'AWS proxy not configured',
          completed_at: new Date().toISOString(),
        })
        .eq('request_id', request_id);

      return new Response(
        JSON.stringify({ success: false, error: 'Proxy not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Call Intelligent Tracer with the locked IP
    console.log('🧠 Calling Intelligent Tracer:', offer?.tracer_mode || 'auto');
    
    const tracerPayload = {
      url: tracking_url,
      mode: offer?.tracer_mode || 'auto',
      proxy_ip: ipInfo.ip_address,
      proxy_port: ipInfo.ip_port || '7000',
      target_country: target_country,
      referrer: referrer,
      max_redirects: 20,
      timeout_ms: 60000,
      aws_proxy_url: settings.aws_proxy_url,
    };

    const tracerResponse = await fetch(`${supabaseUrl}/functions/v1/intelligent-tracer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tracerPayload),
      signal: AbortSignal.timeout(65000),
    });

    const traceEndTime = Date.now();
    const traceTimeMs = traceEndTime - traceStartTime;

    if (!tracerResponse.ok) {
      console.error('❌ Intelligent Tracer failed:', tracerResponse.status);
      const errorText = await tracerResponse.text();
      
      await supabase.rpc('release_ip', {
        p_ip_address: ipInfo.ip_address,
        p_success: false,
        p_response_time_ms: traceTimeMs,
      });

      await supabase
        .from('active_trace_requests')
        .update({
          status: 'failed',
          error_message: `Tracer error: ${tracerResponse.status} - ${errorText}`,
          completed_at: new Date().toISOString(),
          trace_time_ms: traceTimeMs,
        })
        .eq('request_id', request_id);

      return new Response(
        JSON.stringify({ success: false, error: 'Trace failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const traceResult = await tracerResponse.json();
    console.log('✅ Trace completed successfully');
    console.log('   Mode used:', traceResult.mode_used);
    console.log('   Detection reason:', traceResult.detection_reason);
    console.log('   Timing:', traceResult.timing_ms, 'ms');
    console.log('   Bandwidth:', traceResult.bandwidth_kb, 'KB');

    // Step 5: Extract params from result
    const finalUrl = traceResult.final_url || tracking_url;
    const extractedParams = traceResult.extracted_params || {};

    // Merge inbound params with extracted params
    const allParams = { ...inbound_params, ...extractedParams };

    // Step 6: Update offer's detection result if auto mode was used
    if (offer?.tracer_mode === 'auto' || !offer?.tracer_mode) {
      await supabase
        .from('offers')
        .update({
          tracer_detection_result: {
            mode_used: traceResult.mode_used,
            detection_reason: traceResult.detection_reason,
            timing_ms: traceResult.timing_ms,
            bandwidth_kb: traceResult.bandwidth_kb,
            last_detected_at: new Date().toISOString(),
          }
        })
        .eq('id', offer_id);
    }

    // Step 7: Release IP back to pool
    await supabase.rpc('release_ip', {
      p_ip_address: ipInfo.ip_address,
      p_success: true,
      p_response_time_ms: traceTimeMs,
    });

    // Step 8: Update request status to completed
    await supabase
      .from('active_trace_requests')
      .update({
        status: 'completed',
        final_url: finalUrl,
        extracted_params: extractedParams,
        redirect_chain: traceResult.chain,
        completed_at: new Date().toISOString(),
        trace_time_ms: traceTimeMs,
        total_time_ms: traceTimeMs,
        tracer_mode_used: traceResult.mode_used,
        detection_reason: traceResult.detection_reason,
      })
      .eq('request_id', request_id);

    console.log('🎉 Trace request completed:', request_id);

    return new Response(
      JSON.stringify({
        success: true,
        request_id,
        final_url: finalUrl,
        extracted_params: extractedParams,
        all_params: allParams,
        trace_time_ms: traceTimeMs,
        ip_used: ipInfo.ip_address,
        mode_used: traceResult.mode_used,
        detection_reason: traceResult.detection_reason,
        bandwidth_kb: traceResult.bandwidth_kb,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('❌ Top-level error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to process trace',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});