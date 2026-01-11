/**
 * Trackier Configuration Helper
 * 
 * This tool automates the parts that CAN be automated and provides
 * guided manual steps for what requires Trackier dashboard access.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration for your setup
const CONFIG = {
  advertiser_id: 'YOUR_ADVERTISER_ID', // Get from Trackier
  publisher_id: '2',
  webhook_url: 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-webhook',
  api_key: 'YOUR_TRACKIER_API_KEY', // Get from Trackier
  final_landing_page: 'https://www.elcorteingles.es/', // Change to your URL
};

/**
 * STEP 1: Generate URLs for manual entry into Trackier
 */
export function generateTrackierURLs() {
  const campaign309URL = `https://nebula.gotrackier.com/click?campaign_id=309&pub_id=${CONFIG.publisher_id}&force_transparency=true&url=${encodeURIComponent(CONFIG.final_landing_page)}`;
  
  const campaign310URL = `https://nebula.gotrackier.com/click?campaign_id=310&pub_id=${CONFIG.publisher_id}&force_transparent=true&url=${encodeURIComponent(campaign309URL)}`;

  return {
    campaign_310_url: campaign310URL,
    campaign_309_url: campaign309URL,
    webhook_url: CONFIG.webhook_url,
    instructions: `
COPY AND PASTE THESE INTO TRACKIER DASHBOARD:

1. Create Campaign 310 (URL 1 - Passthrough):
   Campaign URL: ${campaign310URL}
   Server Side Clicks: ENABLE
   S2S Push URL: ${CONFIG.webhook_url}

2. Create Campaign 309 (URL 2 - Final):
   Campaign URL: ${campaign309URL}

3. Return here and click "Validate" to confirm setup.
    `,
  };
}

/**
 * STEP 2: Validate campaigns exist in Trackier
 */
export async function validateCampaignSetup(apiKey: string, advertiserId: string) {
  try {
    const response = await fetch('https://api.trackier.com/v2/campaigns', {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: 'Invalid API key or advertiser ID',
        message: response.statusText,
      };
    }

    const campaigns = await response.json();
    const campaign310 = campaigns.data?.find((c: any) => c.id === 310);
    const campaign309 = campaigns.data?.find((c: any) => c.id === 309);

    return {
      success: campaign310 && campaign309 ? true : false,
      campaign_310: campaign310 ? '✅ Found' : '❌ Not found',
      campaign_309: campaign309 ? '✅ Found' : '❌ Not found',
      missing: {
        campaign_310: !campaign310,
        campaign_309: !campaign309,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * STEP 3: Auto-save configuration to database
 */
export async function saveConfiguration(
  userId: string,
  offerId: string,
  config: {
    api_key: string;
    advertiser_id: string;
    campaign_310_id: string;
    campaign_309_id: string;
    final_url: string;
    publisher_id: string;
  }
) {
  try {
    const { data, error } = await supabase
      .from('trackier_offers')
      .insert([
        {
          offer_id: offerId,
          api_key: config.api_key,
          advertiser_id: config.advertiser_id,
          url1_campaign_id: config.campaign_310_id,
          url2_campaign_id: config.campaign_309_id,
          url2_destination_url: config.final_url,
          publisher_id: config.publisher_id,
          webhook_url: CONFIG.webhook_url,
          enabled: true,
        },
      ]);

    return { success: !error, data, error };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * STEP 4: Test webhook connectivity
 */
export async function testWebhookConnectivity() {
  try {
    const response = await fetch(CONFIG.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test: true,
        campaign_id: 310,
        clickid: 'test_click_123',
        timestamp: new Date().toISOString(),
      }),
    });

    return {
      success: response.status < 400,
      status: response.status,
      message: response.ok ? 'Webhook is reachable ✅' : 'Webhook returned error ❌',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      message: 'Webhook is not reachable ❌',
    };
  }
}

/**
 * STEP 5: Generate Google Ads Tracking Template
 */
export function generateGoogleAdsTemplate() {
  const campaign309URL = `https://nebula.gotrackier.com/click?campaign_id=309&pub_id=${CONFIG.publisher_id}&force_transparency=true&url=${encodeURIComponent(CONFIG.final_landing_page)}`;
  
  const campaign310URL = `https://nebula.gotrackier.com/click?campaign_id=310&pub_id=${CONFIG.publisher_id}&force_transparent=true&url=${encodeURIComponent(campaign309URL)}{lpurl}`;

  return {
    template: campaign310URL,
    instructions: `
PASTE THIS INTO GOOGLE ADS:
Campaign → Settings → Tracking Template:
${campaign310URL}

Google will automatically add gclid parameter.
    `,
  };
}

/**
 * MASTER FUNCTION: Run complete setup
 */
export async function runCompleteSetup(input: {
  user_id: string;
  offer_id: string;
  api_key: string;
  advertiser_id: string;
  final_landing_page: string;
  campaign_310_id?: string;
  campaign_309_id?: string;
}) {
  console.log('🚀 Starting Trackier Configuration Setup...\n');

  // Update config
  CONFIG.api_key = input.api_key;
  CONFIG.advertiser_id = input.advertiser_id;
  CONFIG.final_landing_page = input.final_landing_page;

  // Step 1: Generate URLs
  console.log('📋 Step 1: Generating Trackier URLs...');
  const urls = generateTrackierURLs();
  console.log(urls.instructions);

  // Step 2: Validate if campaigns provided
  if (input.campaign_310_id && input.campaign_309_id) {
    console.log('\n✅ Step 2: Validating campaign setup...');
    const validation = await validateCampaignSetup(input.api_key, input.advertiser_id);
    console.log(validation);

    if (!validation.success) {
      console.log('❌ Validation failed. Please create campaigns manually first.');
      return { success: false, message: 'Campaign validation failed' };
    }
  }

  // Step 3: Test webhook
  console.log('\n🔗 Step 3: Testing webhook connectivity...');
  const webhookTest = await testWebhookConnectivity();
  console.log(webhookTest);

  // Step 4: Save configuration
  console.log('\n💾 Step 4: Saving configuration to database...');
  const saved = await saveConfiguration(input.user_id, input.offer_id, {
    api_key: input.api_key,
    advertiser_id: input.advertiser_id,
    campaign_310_id: input.campaign_310_id || '310',
    campaign_309_id: input.campaign_309_id || '309',
    final_url: input.final_landing_page,
    publisher_id: CONFIG.publisher_id,
  });

  if (saved.success) {
    console.log('✅ Configuration saved!\n');
  } else {
    console.log('❌ Failed to save configuration', saved.error);
    return { success: false, error: saved.error };
  }

  // Step 5: Generate Google Ads template
  console.log('📝 Step 5: Google Ads Tracking Template');
  const template = generateGoogleAdsTemplate();
  console.log(template.instructions);

  return {
    success: true,
    summary: {
      webhook_working: webhookTest.success,
      configuration_saved: saved.success,
      next_steps: [
        '1. Create campaigns 310 and 309 in Trackier (if not done)',
        '2. Enable S2S webhook in Campaign 310',
        '3. Paste tracking template in Google Ads',
        '4. Send test click with gclid parameter',
        '5. Monitor webhook logs',
      ],
    },
  };
}

// Export for CLI usage
if (require.main === module) {
  const testInput = {
    user_id: 'user_123',
    offer_id: 'offer_elcorte',
    api_key: process.env.TRACKIER_API_KEY || 'sk_live_...',
    advertiser_id: process.env.TRACKIER_ADVERTISER_ID || '123456',
    final_landing_page: 'https://www.elcorteingles.es/',
    campaign_310_id: '310',
    campaign_309_id: '309',
  };

  runCompleteSetup(testInput);
}
