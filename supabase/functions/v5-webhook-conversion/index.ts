import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function slugToOfferName(slug: string): string {
  if (!slug) return '';
  return slug.toUpperCase().replace(/-/g, '_');
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[v5-webhook ${requestId}] start`, { method: req.method, url: req.url });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const offerSlug = url.pathname.split('/').pop() || '';
    const offerFromSlug = slugToOfferName(offerSlug);

    // Merge query + body; accept GET/POST/PUT
    let bodyParams: Record<string, any> = {};
    let rawBody = '';
    if (req.method === 'POST' || req.method === 'PUT') {
      rawBody = await req.text();
      const contentType = req.headers.get('content-type') || '';
      if (rawBody) {
        try {
          if (contentType.includes('application/json')) {
            bodyParams = JSON.parse(rawBody || '{}');
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            bodyParams = Object.fromEntries(new URLSearchParams(rawBody));
          }
        } catch (e) {
          console.warn('Failed to parse body:', e);
        }
      }
    }

    const queryParams = Object.fromEntries(url.searchParams);
    const params = { ...queryParams, ...bodyParams } as Record<string, any>;
    console.log(`[v5-webhook ${requestId}] merged params`, params);

    // Extract with broad alias support and Trackier macros
    let accountId = params.account_id || params.accountId || null;
    const campaignId = params.campaign_id || params.campaignId || params.p1; // p1 carries Google campaign id
    const offerName = params.offer_name || params.offerName || offerFromSlug;
    const newSuffix = params.suffix || params.new_suffix || params.transaction_id || params.transactionId || null;
    const conversionId = params.conversion_id || params.conversionId || params.conv_id || null;
    const clickId = params.click_id || params.clickId || null;
    const trackierCampaignId = params.trackier_campaign_id || params.tc_id || params.campaignid || null;

    // Require campaign_id and offer_name (account_id optional, will be looked up)
    if (!campaignId || !offerName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: campaign_id and offer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Lookup account_id from mapping if not provided
    if (!accountId) {
      console.log(`[v5-webhook ${requestId}] Looking up account_id for campaign ${campaignId} + offer ${offerName}`);
      const { data: mapping, error: lookupError } = await supabase
        .from('v5_campaign_offer_mapping')
        .select('account_id')
        .eq('campaign_id', campaignId)
        .eq('offer_name', offerName)
        .maybeSingle();

      if (lookupError || !mapping) {
        console.error(`[v5-webhook ${requestId}] Mapping lookup failed:`, lookupError?.message);
        return new Response(
          JSON.stringify({ 
            error: 'No mapping found for this campaign_id + offer_name combination. Please create a mapping first.',
            campaign_id: campaignId,
            offer_name: offerName
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      accountId = mapping.account_id;
      console.log(`[v5-webhook ${requestId}] Resolved account_id:`, accountId);
    }

    // Get unused suffix from bucket (if not already provided)
    let suffixToQueue = newSuffix;
    if (!suffixToQueue) {
      console.log(`[v5-webhook ${requestId}] Fetching suffix from bucket...`);
      const { data: bucketData } = await supabase.rpc('v5_get_multiple_suffixes', {
        p_account_id: accountId,
        p_offer_name: offerName,
        p_count: 1
      });
      
      if (bucketData && bucketData.length > 0) {
        suffixToQueue = bucketData[0].suffix;
        console.log(`[v5-webhook ${requestId}] Got suffix from bucket:`, suffixToQueue.substring(0, 50));
      } else {
        console.warn(`[v5-webhook ${requestId}] No suffix in bucket for ${offerName}`);
      }
    }

    // Queue webhook with suffix attached (ready for Google script to apply)
    const payload = {
      account_id: accountId,
      offer_name: offerName,
      campaign_id: campaignId,
      new_suffix: suffixToQueue,
      status: 'pending',
      trackier_conversion_id: conversionId,
      trackier_click_id: clickId,
    };

    const { error: queueError, data: queuedItem } = await supabase
      .from('v5_webhook_queue')
      .insert(payload)
      .select('id')
      .single();
    
    if (queueError) {
      console.error(`[v5-webhook ${requestId}] Queue insert error:`, queueError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to queue webhook', details: queueError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[v5-webhook ${requestId}] queued with suffix`, payload);

    // Log to campaign suffix log (for campaign-level stats)
    try {
      await supabase.from('v5_campaign_suffix_log').insert({
        account_id: accountId,
        campaign_id: campaignId,
        offer_name: offerName,
        suffix_sent: suffixToQueue || '',
        webhook_id: queuedItem?.id,
        status: 'pending',
        webhook_received_at: new Date().toISOString()
      });
      console.log(`[v5-webhook ${requestId}] Logged to campaign suffix log`);
    } catch (e) {
      console.warn(`[v5-webhook ${requestId}] Failed to log to campaign suffix log:`, e?.message || e);
    }

    // Auto-create mapping if missing (best-effort, non-blocking)
    try {
      await supabase.rpc('insert_v5_mapping_if_missing', {
        p_account_id: accountId,
        p_campaign_id: campaignId,
        p_offer_name: offerName,
        p_campaign_name: params.campaign_name || params.campaignName || null
      });
    } catch (e) {
      console.warn(`[v5-webhook ${requestId}] Mapping insert skipped:`, e?.message || e);
    }

    // Check trace override settings (NEW: conditionally trigger trace)
    try {
      console.log(`[v5-webhook ${requestId}] Checking trace override for ${offerName}...`);
      const { data: traceOverride } = await supabase
        .from('v5_trace_overrides')
        .select('trace_on_webhook, traces_per_day, traces_count_today')
        .eq('offer_name', offerName)
        .maybeSingle();

      let shouldTrace = true;  // Default: trace on webhook
      let reason = 'default (no override)';

      if (traceOverride) {
        // Check if trace_on_webhook is disabled
        if (!traceOverride.trace_on_webhook) {
          shouldTrace = false;
          reason = 'trace_on_webhook disabled in override';
        }
        // Check if daily trace limit reached
        else if (traceOverride.traces_per_day && traceOverride.traces_count_today >= traceOverride.traces_per_day) {
          shouldTrace = false;
          reason = `daily limit reached (${traceOverride.traces_count_today}/${traceOverride.traces_per_day})`;
        }
      }

      console.log(`[v5-webhook ${requestId}] Trace decision: shouldTrace=${shouldTrace}, reason=${reason}`);

      if (shouldTrace) {
        // Trigger trace immediately to refill bucket (non-blocking background)
        console.log(`[v5-webhook ${requestId}] Triggering auto-trace for ${offerName}...`);
        const traceUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offerName)}`;
        fetch(traceUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${supabaseKey}` }
        }).then(async (traceResp) => {
          if (traceResp.ok) {
            const traceData = await traceResp.json();
            console.log(`[v5-webhook ${requestId}] Trace response:`, { success: traceData.success, suffix: traceData.suffix?.substring(0, 20) });
            
            if (traceData.success && traceData.suffix) {
              // Store traced suffix to bucket (offer-level now)
              await supabase.rpc('v5_store_traced_suffixes', {
                p_offer_name: offerName,
                p_suffixes: [{ suffix: traceData.suffix, source: 'traced' }]
              });
              
              // Log trace to v5_trace_log
              await supabase.from('v5_trace_log').insert({
                offer_name: offerName,
                trace_result: 'success',
                suffix_generated: traceData.suffix,
                geo_pool_used: traceData.geo_pool_used || null
              });
              
              // Increment traces_count_today in v5_trace_overrides
              if (traceOverride) {
                await supabase
                  .from('v5_trace_overrides')
                  .update({ 
                    traces_count_today: (traceOverride.traces_count_today || 0) + 1,
                    last_trace_time: new Date().toISOString()
                  })
                  .eq('offer_name', offerName);
              }
              
              console.log(`[v5-webhook ${requestId}] Trace complete, stored to bucket`);
            }
          } else {
            // Log failed trace
            await supabase.from('v5_trace_log').insert({
              offer_name: offerName,
              trace_result: 'failed',
              error_message: `HTTP ${traceResp.status}`
            }).catch(() => {});
            console.warn(`[v5-webhook ${requestId}] Trace failed with status ${traceResp.status}`);
          }
        }).catch((e) => {
          // Log error trace
          supabase.from('v5_trace_log').insert({
            offer_name: offerName,
            trace_result: 'failed',
            error_message: e?.message || 'Unknown error'
          }).catch(() => {});
          console.warn(`[v5-webhook ${requestId}] Trace error:`, e?.message);
        });
      } else {
        // Log that trace was skipped
        await supabase.from('v5_trace_log').insert({
          offer_name: offerName,
          trace_result: 'skipped',
          error_message: reason
        }).catch(() => {});
      }
    } catch (e) {
      console.warn(`[v5-webhook ${requestId}] Trace override check error:`, e?.message || e);
    }

    return new Response(
      JSON.stringify({ success: true, queued: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook handler error:', error.message || error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
