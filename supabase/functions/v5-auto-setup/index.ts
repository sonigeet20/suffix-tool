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
    const { account_id, offer_name, campaigns } = body;

    if (!account_id || !offer_name) {
      return new Response(JSON.stringify({ 
        error: 'Missing account_id or offer_name' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // FIRST: Ensure Trackier campaign exists for this offer (before checking mappings)
    console.log(`[V5-AUTO-SETUP] Ensuring Trackier campaign exists for offer: ${offer_name}`);

    // Get offer details (including user_id to locate the correct settings row)
    const { data: offer } = await supabase
      .from('offers')
      .select('final_url, user_id')
      .eq('name', offer_name)
      .maybeSingle();

    // Get Trackier API credentials from settings (prefer the matching user_id row)
    let settingsQuery = supabase
      .from('settings')
      .select('trackier_api_key')
      .not('trackier_api_key', 'is', null);

    if (offer?.user_id) {
      settingsQuery = settingsQuery.eq('user_id', offer.user_id);
    }

    const { data: settings } = await settingsQuery
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!settings?.trackier_api_key) {
      return new Response(JSON.stringify({ 
        error: `Trackier API key not configured. Please configure it in Settings first.${offer?.user_id ? ` (user_id: ${offer.user_id})` : ''}`,
        setup_needed: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if shared Trackier campaign already exists for this offer
    let trackierCampaignId: string;
    let trackingTemplate: string;
    let webhookUrl: string;
    let trackierCampaignName: string;
    let isNewTrackierCampaign = false;

    const { data: existingTrackier } = await supabase
      .from('v5_trackier_campaigns')
      .select('*')
      .eq('offer_name', offer_name)
      .maybeSingle();

    if (existingTrackier) {
      console.log(`[V5-AUTO-SETUP] Reusing existing Trackier campaign for offer: ${offer_name}`);
      trackierCampaignId = existingTrackier.trackier_campaign_id;
      trackingTemplate = existingTrackier.tracking_template;
      webhookUrl = existingTrackier.webhook_url;
      trackierCampaignName = existingTrackier.trackier_campaign_name;
    } else {
      console.log(`[V5-AUTO-SETUP] Creating new Trackier campaign for offer: ${offer_name}`);
      
      const targetUrl = offer?.final_url || 'https://example.com';
      const trackierApiUrl = (settings as any)?.trackier_api_url || 'https://api.trackier.com';

      // Create Trackier campaign
      const trackierResp = await fetch(`${trackierApiUrl}/v2/campaigns`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Api-Key': settings.trackier_api_key 
        },
        body: JSON.stringify({
          title: `V5-${offer_name}`,
          url: targetUrl,
          redirectType: '200_hrf',
          status: 'active',
          advertiserId: parseInt((settings as any)?.trackier_advertiser_id) || 3,
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
        console.error('[V5-AUTO-SETUP] Trackier API error:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to create Trackier campaign',
          details: errorText
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const trackierCampaign = await trackierResp.json();
      trackierCampaignId = trackierCampaign.data?.id || trackierCampaign.id || trackierCampaign.campaign?.id;
      
      if (!trackierCampaignId) {
        return new Response(JSON.stringify({ 
          error: 'Trackier campaign created but no ID returned',
          details: JSON.stringify(trackierCampaign)
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      webhookUrl = `${supabaseUrl}/functions/v1/v5-webhook-conversion`;
      trackingTemplate = `https://nebula.gotrackier.com/click?campaign_id=${trackierCampaignId}&pub_id=2&force_transparent=true&p1={campaignid}&url={lpurl}`;
      trackierCampaignName = `V5-${offer_name}`;
      isNewTrackierCampaign = true;

      // Store shared Trackier campaign
      await supabase.from('v5_trackier_campaigns').upsert({
        offer_name,
        trackier_campaign_id: trackierCampaignId,
        trackier_campaign_name: trackierCampaignName,
        webhook_url: webhookUrl,
        tracking_template: trackingTemplate,
        redirect_type: '200_hrf'
      }, { onConflict: 'offer_name' });

      console.log(`[V5-AUTO-SETUP] Created Trackier campaign: ${trackierCampaignId}`);
    }

    // SECOND: Check if any mapping exists for this account_id + offer_name
    const { data: existingMappings } = await supabase
      .from('v5_campaign_offer_mapping')
      .select('*')
      .eq('account_id', account_id)
      .eq('offer_name', offer_name);

    // If campaigns provided, create mappings for any that don't exist yet
    let newlyMapped: string[] = [];
    if (campaigns && campaigns.length > 0) {
      console.log(`[V5-AUTO-SETUP] Auto-creating mappings for ${campaigns.length} campaigns...`);
      
      for (const campaign of campaigns) {
        const { data: existing } = await supabase
          .from('v5_campaign_offer_mapping')
          .select('id')
          .eq('account_id', account_id)
          .eq('campaign_id', campaign.id)
          .maybeSingle();

        if (!existing) {
          // Create mapping
          const { error: insertError } = await supabase
            .from('v5_campaign_offer_mapping')
            .insert({
              account_id,
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              offer_name,
              is_active: true,
              auto_created: true
            });

          if (!insertError) {
            newlyMapped.push(campaign.id);
            console.log(`[V5-AUTO-SETUP] Created mapping for campaign ${campaign.id}`);
          } else {
            console.error(`[V5-AUTO-SETUP] Failed to create mapping for campaign ${campaign.id}:`, insertError);
          }
        }
      }
    }

    if (existingMappings && existingMappings.length > 0) {
      console.log(`[V5-AUTO-SETUP] Found ${existingMappings.length} existing mappings`);
      
      // Load shared Trackier campaign details
      const { data: trackierData } = await supabase
        .from('v5_trackier_campaigns')
        .select('*')
        .eq('offer_name', offer_name)
        .maybeSingle();

      return new Response(JSON.stringify({
        success: true,
        setup_needed: false,
        message: 'Account already configured',
        existing_campaigns: existingMappings.map(m => m.campaign_id),
        trackier: trackierData ? {
          campaignId: trackierData.trackier_campaign_id,
          campaignName: trackierData.trackier_campaign_name,
          trackingTemplate: trackierData.tracking_template,
          webhookUrl: `${trackierData.webhook_url}?campaign_id={p1}&offer_name=${offer_name}`
        } : null
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // THIRD: Prepare final response with Trackier campaign details
    return new Response(JSON.stringify({
      success: true,
      setup_needed: newlyMapped.length > 0 || (existingMappings && existingMappings.length === 0),
      message: newlyMapped.length > 0 ? `Auto-mapped ${newlyMapped.length} campaigns and created Trackier campaign` : 'Setup complete',
      account_id,
      offer_name,
      newly_mapped: newlyMapped,
      existing_campaigns: existingMappings?.map((m: any) => m.campaign_id) || [],
      trackier: {
        campaignId: trackierCampaignId,
        campaignName: trackierCampaignName,
        trackingTemplate: trackingTemplate,
        webhookUrl: `${webhookUrl}?campaign_id={p1}&offer_name=${offer_name}`,
        isNew: isNewTrackierCampaign
      },
      instructions: [
        `✅ Trackier campaign ${isNewTrackierCampaign ? 'created' : 'exists'}: ${trackierCampaignId}`,
        `✅ ${newlyMapped.length > 0 ? `Auto-mapped ${newlyMapped.length} campaign(s)` : 'Campaigns already mapped'}`,
        ``,
        `📋 Next Steps:`,
        `1. Add tracking template to each Google Ads campaign:`,
        `   ${trackingTemplate}`,
        ``,
        `2. Add postback URL to Trackier campaign ${trackierCampaignId}:`,
        `   ${webhookUrl}?campaign_id={p1}&offer_name=${offer_name}`,
        ``,
        `3. In Trackier, set {p1} to pass Google Ads campaign ID`
      ]
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error('[V5-AUTO-SETUP] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
