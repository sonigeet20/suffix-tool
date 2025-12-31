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

    console.log('📥 Incoming click for offer:', offerName);

    let trackingUrls: any[] = [];
    if (offer.tracking_urls && Array.isArray(offer.tracking_urls)) {
      trackingUrls = offer.tracking_urls;
    }

    let selectedTrackingUrl = offer.final_url;
    if (trackingUrls.length > 0) {
      const randomIndex = Math.floor(Math.random() * trackingUrls.length);
      selectedTrackingUrl = trackingUrls[randomIndex].url || offer.final_url;
    }

    let selectedReferrer: string | undefined;
    if (offer.referrers && Array.isArray(offer.referrers) && offer.referrers.length > 0) {
      const randomRefIndex = Math.floor(Math.random() * offer.referrers.length);
      selectedReferrer = offer.referrers[randomRefIndex].url;
    }

    // 🔥 FETCH FRESH PARAMS FROM PROXY SERVICE
    const { data: settings } = await supabase
      .from('settings')
      .select('aws_proxy_url')
      .maybeSingle();

    let freshParams: Record<string, string> = {};
    const proxyUrl = settings?.aws_proxy_url;

    if (proxyUrl) {
      try {
        console.log('🔄 Fetching fresh params from proxy...');
        const proxyResponse = await fetch(`${proxyUrl}/trace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: selectedTrackingUrl,
            country: offer.target_country || 'us',
            referrer: selectedReferrer,
          }),
          signal: AbortSignal.timeout(8000), // 8 second timeout for instant response
        });

        if (proxyResponse.ok) {
          const proxyData = await proxyResponse.json();
          if (proxyData.success && proxyData.finalUrl) {
            const finalUrl = new URL(proxyData.finalUrl);
            finalUrl.searchParams.forEach((value, key) => {
              freshParams[key] = value;
            });
            console.log('✅ Got fresh params:', freshParams);
          }
        } else {
          console.warn('⚠️ Proxy returned non-OK status:', proxyResponse.status);
        }
      } catch (proxyError) {
        console.error('⚠️ Proxy fetch failed:', proxyError);
      }
    }

    // ✅ ONLY USE FRESH PARAMS (no merging with inbound)
    const finalParams = freshParams;
    console.log('🎯 Fresh params for redirect:', finalParams);

    // Create trace request for background processing (for next rotation)
    const { data: traceRequest, error: traceError } = await supabase
      .from('active_trace_requests')
      .insert({
        offer_id: offer.id,
        tracking_url: selectedTrackingUrl,
        target_country: offer.target_country || 'us',
        inbound_params: finalParams,
        status: 'pending',
      })
      .select()
      .single();

    if (!traceError && traceRequest) {
      console.log('✅ Created trace request:', traceRequest.request_id);

      // Spawn background worker for next rotation
      const workerPayload = {
        request_id: traceRequest.request_id,
        offer_id: offer.id,
        tracking_url: selectedTrackingUrl,
        target_country: offer.target_country || 'us',
        inbound_params: finalParams,
        referrer: selectedReferrer,
      };

      fetch(`${supabaseUrl}/functions/v1/process-trace-parallel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(workerPayload),
      }).catch((err) => {
        console.error('⚠️ Failed to spawn trace worker:', err);
      });
    }

    // Log the hit
    await supabase.from('url_traces').insert({
      offer_id: offer.id,
      visitor_ip: visitorIp,
      user_agent: userAgent,
      referrer: referrer,
      device_type: deviceType,
      final_url: selectedTrackingUrl,
      query_params: finalParams,
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

    // ⚡ BUILD FINAL URL WITH FRESH PARAMS
    const finalUrl = new URL(selectedTrackingUrl);
    Object.entries(finalParams).forEach(([key, value]) => {
      finalUrl.searchParams.set(key, value);
    });

    console.log('⚡ Returning final URL for Google Ads script:', finalUrl.toString());

    // Return JSON for Google Ads scripts to handle client-side redirect
    return new Response(
      JSON.stringify({
        success: true,
        finalUrl: finalUrl.toString(),
        offer: offerName,
        paramsCount: Object.keys(finalParams).length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

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