import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function detectDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return 'bot';
  }
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  }
  return 'desktop';
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
    const offerName = url.searchParams.get('offer');

    if (!offerName) {
      return new Response(
        JSON.stringify({ error: 'offer parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('offer_name', offerName)
      .eq('is_active', true)
      .maybeSingle();

    if (offerError || !offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found or inactive' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const visitorIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const referrer = req.headers.get('referer') || req.headers.get('referrer') || '';
    const deviceType = detectDeviceType(userAgent);

    // Extract all query params (these are from Google Ads: gclid, fbclid, etc.)
    const inboundParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      if (key !== 'offer') {
        inboundParams[key] = value;
      }
    });

    console.log('📥 Incoming click for offer:', offerName, 'Params:', inboundParams);

    // Get tracking URLs from rotation system
    let trackingUrls: any[] = [];
    if (offer.tracking_urls && Array.isArray(offer.tracking_urls)) {
      trackingUrls = offer.tracking_urls;
    }

    // Select tracking URL based on rotation mode
    let selectedTrackingUrl = offer.final_url;
    if (trackingUrls.length > 0) {
      // Simple round-robin for now (could be weighted, random, etc.)
      const randomIndex = Math.floor(Math.random() * trackingUrls.length);
      selectedTrackingUrl = trackingUrls[randomIndex].url || offer.final_url;
    }

    // Get referrer from rotation system if configured
    let selectedReferrer: string | undefined;
    if (offer.referrers && Array.isArray(offer.referrers) && offer.referrers.length > 0) {
      const randomRefIndex = Math.floor(Math.random() * offer.referrers.length);
      selectedReferrer = offer.referrers[randomRefIndex].url;
    }

    // Create trace request record
    const { data: traceRequest, error: traceError } = await supabase
      .from('active_trace_requests')
      .insert({
        offer_id: offer.id,
        tracking_url: selectedTrackingUrl,
        target_country: offer.target_country || 'us',
        inbound_params: inboundParams,
        status: 'pending',
      })
      .select()
      .single();

    if (traceError || !traceRequest) {
      console.error('❌ Failed to create trace request:', traceError);
      // Fallback: redirect to final URL with inbound params
      const fallbackUrl = new URL(offer.final_url);
      Object.entries(inboundParams).forEach(([key, value]) => {
        fallbackUrl.searchParams.set(key, value);
      });
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': fallbackUrl.toString() },
      });
    }

    console.log('✅ Created trace request:', traceRequest.request_id);

    // Spawn parallel trace worker (async, non-blocking)
    const workerPayload = {
      request_id: traceRequest.request_id,
      offer_id: offer.id,
      tracking_url: selectedTrackingUrl,
      target_country: offer.target_country || 'us',
      inbound_params: inboundParams,
      referrer: selectedReferrer,
    };

    // Fire-and-forget async trace
    fetch(`${supabaseUrl}/functions/v1/process-trace-parallel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workerPayload),
    }).catch((err) => {
      console.error('⚠️ Failed to spawn trace worker:', err);
    });

    // Immediate response strategy:
    // Option 1: Wait for trace with timeout (5-15 seconds)
    // Option 2: Redirect immediately to tracking URL and let params append later
    // Let's use Option 1 with 10-second timeout

    const maxWaitMs = 10000; // 10 seconds
    const pollIntervalMs = 500; // Check every 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const { data: updatedRequest } = await supabase
        .from('active_trace_requests')
        .select('status, final_url, extracted_params')
        .eq('request_id', traceRequest.request_id)
        .single();

      if (updatedRequest?.status === 'completed' && updatedRequest.final_url) {
        console.log('✅ Trace completed, redirecting with params');
        
        // Build final redirect URL with all params
        const redirectUrl = new URL(updatedRequest.final_url);
        
        // Add inbound params
        Object.entries(inboundParams).forEach(([key, value]) => {
          redirectUrl.searchParams.set(key, value);
        });

        // Record hit in url_traces
        await supabase.from('url_traces').insert({
          offer_id: offer.id,
          visitor_ip: visitorIp,
          user_agent: userAgent,
          referrer: referrer,
          device_type: deviceType,
          final_url: redirectUrl.toString(),
          query_params: inboundParams,
          visited_at: new Date().toISOString(),
        });

        // Update statistics
        const { data: currentStats } = await supabase
          .from('offer_statistics')
          .select('*')
          .eq('offer_id', offer.id)
          .maybeSingle();

        await supabase
          .from('offer_statistics')
          .upsert({
            offer_id: offer.id,
            total_suffix_requests: (currentStats?.total_suffix_requests || 0) + 1,
            total_tracking_hits: (currentStats?.total_tracking_hits || 0) + 1,
            last_request_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'offer_id' });

        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, 'Location': redirectUrl.toString() },
        });
      }

      if (updatedRequest?.status === 'failed' || updatedRequest?.status === 'timeout') {
        console.warn('⚠️ Trace failed/timeout, using fallback');
        break;
      }
    }

    // Timeout or failure: redirect to tracking URL with inbound params
    console.log('⏰ Trace timeout, redirecting to tracking URL with inbound params');
    const fallbackUrl = new URL(selectedTrackingUrl);
    Object.entries(inboundParams).forEach(([key, value]) => {
      fallbackUrl.searchParams.set(key, value);
    });

    // Still record the hit
    await supabase.from('url_traces').insert({
      offer_id: offer.id,
      visitor_ip: visitorIp,
      user_agent: userAgent,
      referrer: referrer,
      device_type: deviceType,
      final_url: fallbackUrl.toString(),
      query_params: inboundParams,
      visited_at: new Date().toISOString(),
    });

    await supabase
      .from('offer_statistics')
      .upsert({
        offer_id: offer.id,
        total_suffix_requests: 0,
        total_tracking_hits: 1,
        last_request_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'offer_id' });

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': fallbackUrl.toString() },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});