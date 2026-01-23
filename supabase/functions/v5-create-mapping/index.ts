import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
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
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    const body = await req.json();
    const { 
      account_id, 
      google_campaign_id, 
      offer_name, 
      campaign_name, 
      trackier_api_key, 
      trackier_api_url,
      trackier_advertiser_id
    } = body;

    if (!account_id || !google_campaign_id || !offer_name) {
      return new Response(JSON.stringify({ error: 'Missing account_id, google_campaign_id, or offer_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Auto-fetch Trackier API key from settings if not provided
    let finalTrackierApiKey = trackier_api_key;
    let finalTrackierApiUrl = trackier_api_url || 'https://api.trackier.com';
    
    if (!finalTrackierApiKey) {
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('trackier_api_key')
        .limit(1)
        .maybeSingle();
      
      console.log('Settings query result:', { settings, settingsError });
      
      if (settings?.trackier_api_key) {
        finalTrackierApiKey = settings.trackier_api_key;
      }
    }

    // Check if mapping already exists
    const { data: existing } = await supabase
      .from('v5_campaign_offer_mapping')
      .select('*')
      .eq('account_id', account_id)
      .eq('campaign_id', google_campaign_id)
      .maybeSingle();

    if (existing) {
      // Load shared Trackier details by offer_name
      const { data: trackierData } = await supabase
        .from('v5_trackier_campaigns')
        .select('*')
        .eq('offer_name', offer_name)
        .maybeSingle();

      return new Response(JSON.stringify({
        success: true,
        exists: true,
        mapping: existing,
        trackier: trackierData ? {
          campaignId: trackierData.trackier_campaign_id,
          campaignName: trackierData.trackier_campaign_name,
          webhookUrl: `${trackierData.webhook_url}?campaign_id={p1}&offer_name=${offer_name}`,
          trackingTemplate: trackierData.tracking_template,
          instructions: [
            `1. Add Tracking Template to Google Ads Campaign ${google_campaign_id}:`,
            `   ${trackierData.tracking_template}`,
            `2. Add Postback URL to Trackier Campaign ${trackierData.trackier_campaign_id}:`,
            `   ${trackierData.webhook_url}?campaign_id={p1}&offer_name=${offer_name}`,
            `3. The {p1} will pass Google campaign ID (account_id auto-resolved)`,
            `4. This template works across all accounts for offer: ${offer_name}`
          ]
        } : null
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!finalTrackierApiKey) {
      return new Response(JSON.stringify({ error: 'Trackier API key not found. Please configure it in Settings.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if a shared Trackier campaign already exists for this offer
    const { data: existingTrackier } = await supabase
      .from('v5_trackier_campaigns')
      .select('*')
      .eq('offer_name', offer_name)
      .maybeSingle();

    let trackierCampaignId: string;
    let trackingTemplate: string;
    let webhookUrl: string;
    let trackierCampaignName: string;

    if (existingTrackier) {
      // Reuse existing Trackier campaign
      console.log('Reusing existing Trackier campaign for offer:', offer_name);
      trackierCampaignId = existingTrackier.trackier_campaign_id;
      trackingTemplate = existingTrackier.tracking_template;
      webhookUrl = existingTrackier.webhook_url;
      trackierCampaignName = existingTrackier.trackier_campaign_name;
    } else {
      // Create new Trackier campaign for this offer
      console.log('Creating new Trackier campaign for offer:', offer_name);
      const { data: offer } = await supabase
        .from('offers')
        .select('final_url')
        .eq('name', offer_name)
        .maybeSingle();
      
      const targetUrl = offer?.final_url || 'https://example.com';

      // Create Trackier campaign with redirectType: 200_hrf
      const trackierResp = await fetch(`${finalTrackierApiUrl}/v2/campaigns`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Api-Key': finalTrackierApiKey 
        },
        body: JSON.stringify({
          title: campaign_name || `V5-${offer_name}`,
          url: targetUrl,
          redirectType: '200_hrf',
          status: 'active',
          advertiserId: parseInt(trackier_advertiser_id) || 3,
          currency: 'USD',
          device: 'all',
          convTracking: 'iframe_https',
          convTrackingDomain: 'nebula.gotrackier.com',
          payouts: [{
            currency: 'USD',
            revenue: 0,
            payout: 0,
            geo: ['ALL']
          }]
        })
      });

      if (!trackierResp.ok) {
        const errorText = await trackierResp.text();
        console.error('Trackier API error:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to create Trackier campaign',
          details: errorText
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const trackierCampaign = await trackierResp.json();
      console.log('Trackier campaign response:', trackierCampaign);
      
      // Extract campaign ID from different possible response structures
      trackierCampaignId = trackierCampaign.data?.id || trackierCampaign.id || trackierCampaign.campaign?.id;
      
      if (!trackierCampaignId) {
        console.error('No campaign ID in response:', trackierCampaign);
        return new Response(JSON.stringify({ 
          error: 'Trackier campaign created but no ID returned',
          details: JSON.stringify(trackierCampaign)
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Generate webhook URL and tracking template (universal for all accounts)
      webhookUrl = `${supabaseUrl}/functions/v1/v5-webhook-conversion`;
      trackingTemplate = `https://nebula.gotrackier.com/click?campaign_id=${trackierCampaignId}&pub_id=2&force_transparent=true&p1={campaignid}&url={lpurl}`;
      trackierCampaignName = campaign_name || `V5-${offer_name}`;

      // Store shared Trackier campaign (one per offer_name)
      await supabase.from('v5_trackier_campaigns').upsert({
        offer_name,
        trackier_campaign_id: trackierCampaignId,
        trackier_campaign_name: trackierCampaignName,
        webhook_url: webhookUrl,
        tracking_template: trackingTemplate,
        redirect_type: '200_hrf'
      }, { onConflict: 'offer_name' });
    }

    // Insert mapping (account + campaign → offer)
    const { data: mapping, error: mappingError } = await supabase
      .from('v5_campaign_offer_mapping')
      .insert({
        account_id,
        campaign_id: google_campaign_id,
        campaign_name: campaign_name || `V5-${offer_name}-GA${google_campaign_id}`,
        offer_name,
        is_active: true,
        auto_created: body.auto_created || false
      })
      .select()
      .single();

    if (mappingError) {
      console.error('Mapping insert error:', mappingError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create mapping', 
        details: mappingError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const webhookUrlWithParams = `${webhookUrl}?campaign_id={p1}&offer_name=${offer_name}`;

    return new Response(JSON.stringify({
      success: true,
      mapping,
      trackier: {
        campaignId: trackierCampaignId,
        campaignName: trackierCampaignName,
        webhookUrl: webhookUrlWithParams,
        trackingTemplate: trackingTemplate,
        redirectType: '200_hrf',
        shared: !!existingTrackier,
        instructions: [
          `1. Add Tracking Template to Google Ads Campaign ${google_campaign_id}:`,
          `   ${trackingTemplate}`,
          ``,
          `2. Add Postback URL to Trackier Campaign ${trackierCampaignId}:`,
          `   ${webhookUrlWithParams}`,
          ``,
          `   Note: {p1} will contain Google campaign ID (account_id auto-resolved from mapping)`,
          ``,
          `3. This template works across ALL accounts for offer: ${offer_name}`,
          ``,
          `4. Flow: Google Ads → Trackier (p1={campaignid}) → Webhook (campaign_id={p1} + offer_name) → Lookup account_id → Queue`
        ]
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Handler error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
