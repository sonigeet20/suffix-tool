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

    // v5_webhook_queue currently lacks trackier_campaign_id, so omit it to prevent insert failure.
    const payload = {
      account_id: accountId,
      offer_name: offerName,
      campaign_id: campaignId,
      new_suffix: newSuffix,
      status: 'pending',
      trackier_conversion_id: conversionId,
      trackier_click_id: clickId,
    };

    const { error } = await supabase.from('v5_webhook_queue').insert(payload);
    if (error) {
      console.error(`[v5-webhook ${requestId}] Queue insert error:`, error.message);
      return new Response(
        JSON.stringify({ error: 'Failed to queue webhook', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[v5-webhook ${requestId}] queued`, payload);

    // Auto-create mapping if missing (best-effort, non-blocking)
    try {
      await supabase.rpc('insert_v5_mapping_if_missing', {
        p_account_id: accountId,
        p_campaign_id: campaignId,
        p_offer_name: offerName,
        p_campaign_name: body.campaign_name || body.campaignName || null
      });
    } catch (e) {
      console.warn(`[v5-webhook ${requestId}] Mapping insert skipped:`, e?.message || e);
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
