import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface TrackingUrlEntry {
  url: string;
  weight: number;
  enabled: boolean;
  label: string;
}

interface ReferrerEntry {
  url: string;
  weight: number;
  enabled: boolean;
  label: string;
  hops?: number[];
}

function selectByMode(
  items: Array<TrackingUrlEntry | ReferrerEntry>,
  mode: string,
  currentIndex: number
): { selected: TrackingUrlEntry | ReferrerEntry; newIndex: number } | null {
  const enabledItems = items.filter(item => item.enabled !== false);

  if (enabledItems.length === 0) {
    return null;
  }

  if (mode === 'sequential') {
    const actualIndex = currentIndex % enabledItems.length;
    return {
      selected: enabledItems[actualIndex],
      newIndex: (actualIndex + 1) % enabledItems.length
    };
  } else if (mode === 'random') {
    const randomIndex = Math.floor(Math.random() * enabledItems.length);
    return {
      selected: enabledItems[randomIndex],
      newIndex: currentIndex
    };
  } else if (mode === 'weighted-random') {
    const totalWeight = enabledItems.reduce((sum, item) => sum + (item.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (const item of enabledItems) {
      random -= (item.weight || 1);
      if (random <= 0) {
        return {
          selected: item,
          newIndex: currentIndex
        };
      }
    }

    return {
      selected: enabledItems[0],
      newIndex: currentIndex
    };
  }

  return null;
}

function filterParams(
  params: Record<string, string>,
  filterMode: string,
  filterList: string[]
): Record<string, string> {
  if (filterMode === 'all' || !filterList || filterList.length === 0) {
    return params;
  }

  const filtered: Record<string, string> = {};

  if (filterMode === 'whitelist') {
    for (const key of Object.keys(params)) {
      if (filterList.includes(key)) {
        filtered[key] = params[key];
      }
    }
  } else if (filterMode === 'blacklist') {
    for (const key of Object.keys(params)) {
      if (!filterList.includes(key)) {
        filtered[key] = params[key];
      }
    }
  }

  return filtered;
}

function generateSuffix(
  offerName: string,
  campaign_id: string,
  campaignCount: number,
  intervalUsed: number
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const offerPrefix = offerName.substring(0, 3).toUpperCase();
  const campaignSuffix = campaign_id.substring(campaign_id.length - 3);
  
  return `${offerPrefix}_${campaignSuffix}_${random}`;
}

async function updateUsageStats(
  supabase: any,
  offerId: string,
  campaign_id: string,
  trackingUrl: string,
  trackingLabel: string,
  referrerUrl: string | null,
  referrerLabel: string | null,
  success: boolean
) {
  try {
    const { data: existingTrackingUsage } = await supabase
      .from('tracking_url_usage')
      .select('*')
      .eq('offer_id', offerId)
      .eq('tracking_url', trackingUrl)
      .eq('campaign_id', campaign_id)
      .maybeSingle();

    if (existingTrackingUsage) {
      await supabase
        .from('tracking_url_usage')
        .update({
          times_used: existingTrackingUsage.times_used + 1,
          success_count: success ? existingTrackingUsage.success_count + 1 : existingTrackingUsage.success_count,
          failure_count: success ? existingTrackingUsage.failure_count : existingTrackingUsage.failure_count + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingTrackingUsage.id);
    } else {
      await supabase
        .from('tracking_url_usage')
        .insert({
          offer_id: offerId,
          campaign_id: campaign_id,
          tracking_url: trackingUrl,
          tracking_url_label: trackingLabel,
          times_used: 1,
          success_count: success ? 1 : 0,
          failure_count: success ? 0 : 1,
          last_used_at: new Date().toISOString(),
        });
    }

    if (referrerUrl) {
      const { data: existingReferrerUsage } = await supabase
        .from('referrer_usage')
        .select('*')
        .eq('offer_id', offerId)
        .eq('referrer_url', referrerUrl)
        .eq('campaign_id', campaign_id)
        .maybeSingle();

      if (existingReferrerUsage) {
        await supabase
          .from('referrer_usage')
          .update({
            times_used: existingReferrerUsage.times_used + 1,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingReferrerUsage.id);
      } else {
        await supabase
          .from('referrer_usage')
          .insert({
            offer_id: offerId,
            campaign_id: campaign_id,
            referrer_url: referrerUrl,
            referrer_label: referrerLabel || '',
            times_used: 1,
            last_used_at: new Date().toISOString(),
          });
      }
    }
  } catch (error: any) {
    console.error('Error updating usage stats:', error.message);
  }
}

interface BatchRequest {
  campaign_offer_mapping: Record<string, string>; // { campaignId: offerName, ... }
  campaign_count: number;
  interval_used: number;
  account_id?: string;
}

interface SuffixResult {
  campaign_id: string;
  suffix: string;
  offer_name: string;
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

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: BatchRequest = await req.json();
    const { campaign_offer_mapping, campaign_count, interval_used, account_id } = body;

    if (!campaign_offer_mapping || Object.keys(campaign_offer_mapping).length === 0) {
      return new Response(
        JSON.stringify({ error: 'campaign_offer_mapping is required and must not be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📦 Batch suffix request for ${Object.keys(campaign_offer_mapping).length} campaigns`);
    console.log(`   Mapping: ${JSON.stringify(campaign_offer_mapping)}`);
    console.log(`   Interval: ${interval_used}ms, Account: ${account_id || 'unknown'}`);

    const results: SuffixResult[] = [];
    const offerCache: Record<string, any> = {};

    // Fetch all unique offers once
    const uniqueOfferNames = [...new Set(Object.values(campaign_offer_mapping))];
    console.log(`🔍 Fetching ${uniqueOfferNames.length} unique offers`);

    for (const offerName of uniqueOfferNames) {
      const { data: offer, error: offerError } = await supabase
        .from('offers')
        .select('*')
        .eq('offer_name', offerName)
        .eq('is_active', true)
        .maybeSingle();

      if (offerError) {
        console.error(`❌ Error fetching offer ${offerName}:`, offerError);
        continue;
      }

      if (!offer) {
        console.warn(`⚠️ Offer not found or inactive: ${offerName}`);
        continue;
      }

      offerCache[offerName] = offer;
      console.log(`✅ Cached offer: ${offerName}`);
    }

    // Generate suffix for each campaign
    for (const [campaign_id, offer_name] of Object.entries(campaign_offer_mapping)) {
      const offer = offerCache[offer_name];

      if (!offer) {
        console.warn(`⚠️ Skipping campaign ${campaign_id}: offer ${offer_name} not available`);
        continue;
      }

      // Generate unique suffix for this campaign
      const suffix = generateSuffix(offer_name, campaign_id, campaign_count, interval_used);

      results.push({
        campaign_id,
        suffix,
        offer_name
      });

      console.log(`   Campaign ${campaign_id} → ${offer_name}: ${suffix}`);
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No valid campaigns processed',
          mapped_campaigns: Object.keys(campaign_offer_mapping).length,
          processed_campaigns: 0
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Generated ${results.length} suffixes for batch request`);

    return new Response(
      JSON.stringify({
        success: true,
        suffixes: results,
        campaign_count: results.length,
        interval_used: interval_used
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error in get-suffix-batch:', error.message);
    console.error('   Stack:', error.stack);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
