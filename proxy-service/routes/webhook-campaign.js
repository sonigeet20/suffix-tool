const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TRACKIER_API_URL = 'https://api.trackier.com/v2';

// Supabase client
const supabase = axios.create({
    baseURL: `${SUPABASE_URL}/rest/v1`,
    headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
});

/**
 * Create new campaign mapping
 * POST /api/webhook-campaign/create
 * Body: {
 *   accountId: string,
 *   campaignId: string,
 *   campaignName: string,
 *   offerName: string,
 *   offerId: string (optional),
 *   createdBy: string (optional)
 * }
 */
router.post('/create', async (req, res) => {
    try {
        const { accountId, campaignId, campaignName, offerName, offerId, createdBy } = req.body;

        // Validate required fields
        if (!accountId || !campaignId || !offerName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: accountId, campaignId, offerName'
            });
        }

        // Check if mapping already exists
        const existingCheck = await supabase.get('/webhook_campaign_mappings', {
            params: {
                account_id: `eq.${accountId}`,
                campaign_id: `eq.${campaignId}`,
                select: 'id,mapping_id,trackier_campaign_id'
            }
        });

        if (existingCheck.data && existingCheck.data.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Mapping already exists for this Google Ads campaign',
                existing: existingCheck.data[0]
            });
        }

        // Create Trackier campaign
        console.log('Creating Trackier campaign...');
        const trackierCampaign = await createTrackierCampaign(offerName, accountId, campaignId);

        if (!trackierCampaign.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to create Trackier campaign',
                details: trackierCampaign.error
            });
        }

        // Create mapping in database
        const mappingData = {
            account_id: accountId,
            campaign_id: campaignId,
            campaign_name: campaignName || `Campaign ${campaignId}`,
            offer_name: offerName,
            offer_id: offerId || null,
            trackier_campaign_id: trackierCampaign.campaignId,
            trackier_webhook_url: trackierCampaign.webhookUrl,
            is_active: true,
            created_by: createdBy || 'system'
        };

        const mappingResult = await supabase.post('/webhook_campaign_mappings', mappingData);

        if (!mappingResult.data || mappingResult.data.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'Failed to save mapping to database'
            });
        }

        const savedMapping = mappingResult.data[0];

        // Log creation
        await supabase.post('/webhook_suffix_usage_log', {
            mapping_id: savedMapping.mapping_id,
            action: 'mapping_created',
            suffix: '',
            account_id: accountId,
            campaign_id: campaignId,
            metadata: {
                trackier_campaign_id: trackierCampaign.campaignId,
                offer_name: offerName
            }
        }).catch(err => console.error('Failed to log creation:', err.message));

        res.json({
            success: true,
            mapping: savedMapping,
            trackier: {
                campaignId: trackierCampaign.campaignId,
                webhookUrl: trackierCampaign.webhookUrl,
                clickUrl: trackierCampaign.clickUrl
            },
            message: 'Campaign mapping created successfully. Add the webhook URL to Trackier S2S postback.'
        });

    } catch (error) {
        console.error('Error creating campaign mapping:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get all campaign mappings
 * GET /api/webhook-campaign/list
 */
router.get('/list', async (req, res) => {
    try {
        const { active } = req.query;

        let query = {
            select: '*',
            order: 'created_at.desc'
        };

        if (active === 'true') {
            query['is_active'] = 'eq.true';
        }

        const result = await supabase.get('/webhook_campaign_mappings', { params: query });

        // Get bucket status for each mapping
        const mappingsWithStats = await Promise.all(result.data.map(async (mapping) => {
            try {
                const bucketStatus = await supabase.get('/webhook_suffix_bucket', {
                    params: {
                        mapping_id: `eq.${mapping.mapping_id}`,
                        select: 'id,times_used,is_valid,fetched_at'
                    }
                });

                const validSuffixes = bucketStatus.data.filter(s => s.is_valid).length;
                const totalSuffixes = bucketStatus.data.length;
                const totalUsage = bucketStatus.data.reduce((sum, s) => sum + s.times_used, 0);

                return {
                    ...mapping,
                    bucket_stats: {
                        total_suffixes: totalSuffixes,
                        valid_suffixes: validSuffixes,
                        total_usage: totalUsage,
                        last_fetch: bucketStatus.data.length > 0 
                            ? Math.max(...bucketStatus.data.map(s => new Date(s.fetched_at).getTime()))
                            : null
                    }
                };
            } catch (err) {
                console.error(`Failed to get bucket stats for ${mapping.mapping_id}:`, err.message);
                return {
                    ...mapping,
                    bucket_stats: { total_suffixes: 0, valid_suffixes: 0, total_usage: 0 }
                };
            }
        }));

        res.json({
            success: true,
            mappings: mappingsWithStats,
            count: mappingsWithStats.length
        });

    } catch (error) {
        console.error('Error listing mappings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check if mapping exists for account and campaign
 * GET /api/webhook-campaign/check?account_id=xxx&campaign_id=xxx
 */
router.get('/check', async (req, res) => {
    try {
        const { account_id, campaign_id } = req.query;

        if (!account_id || !campaign_id) {
            return res.status(400).json({
                success: false,
                error: 'account_id and campaign_id are required'
            });
        }

        const result = await supabase.get('/webhook_campaign_mappings', {
            params: {
                account_id: `eq.${account_id}`,
                campaign_id: `eq.${campaign_id}`,
                select: 'mapping_id'
            }
        });

        res.json({
            success: true,
            exists: result.data.length > 0,
            mapping_id: result.data.length > 0 ? result.data[0].mapping_id : null
        });

    } catch (error) {
        console.error('Error checking mapping:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Toggle mapping active status
 * PATCH /api/webhook-campaign/:mappingId/toggle
 */
router.patch('/:mappingId/toggle', async (req, res) => {
    try {
        const { mappingId } = req.params;

        // Get current status
        const current = await supabase.get('/webhook_campaign_mappings', {
            params: {
                mapping_id: `eq.${mappingId}`,
                select: 'is_active'
            }
        });

        if (!current.data || current.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Mapping not found'
            });
        }

        const newStatus = !current.data[0].is_active;

        // Update status
        await supabase.patch(`/webhook_campaign_mappings?mapping_id=eq.${mappingId}`, {
            is_active: newStatus
        });

        res.json({
            success: true,
            mapping_id: mappingId,
            is_active: newStatus
        });

    } catch (error) {
        console.error('Error toggling mapping:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get mapping details with stats
 * GET /api/webhook-campaign/:mappingId
 */
router.get('/:mappingId', async (req, res) => {
    try {
        const { mappingId } = req.params;

        // Get mapping
        const mappingResult = await supabase.get('/webhook_campaign_mappings', {
            params: {
                mapping_id: `eq.${mappingId}`,
                select: '*'
            }
        });

        if (!mappingResult.data || mappingResult.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Mapping not found'
            });
        }

        const mapping = mappingResult.data[0];

        // Get bucket suffixes
        const bucketResult = await supabase.get('/webhook_suffix_bucket', {
            params: {
                mapping_id: `eq.${mappingId}`,
                select: '*',
                order: 'fetched_at.desc'
            }
        });

        // Get recent usage log
        const logResult = await supabase.get('/webhook_suffix_usage_log', {
            params: {
                mapping_id: `eq.${mappingId}`,
                select: '*',
                order: 'timestamp.desc',
                limit: 50
            }
        });

        // Get pending queue items
        const queueResult = await supabase.get('/webhook_suffix_update_queue', {
            params: {
                mapping_id: `eq.${mappingId}`,
                status: 'eq.pending',
                select: '*',
                order: 'webhook_received_at.desc'
            }
        });

        res.json({
            success: true,
            mapping,
            bucket: {
                suffixes: bucketResult.data,
                count: bucketResult.data.length,
                valid_count: bucketResult.data.filter(s => s.is_valid).length
            },
            recent_usage: logResult.data,
            pending_updates: queueResult.data
        });

    } catch (error) {
        console.error('Error getting mapping details:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get Trackier API Key and Advertiser ID from Supabase settings table
 */
async function getTrackierConfig() {
    try {
        const result = await supabase.get('/settings', {
            params: {
                select: 'trackier_api_key',
                limit: 1
            }
        });

        console.log('Settings query result:', JSON.stringify(result.data));

        if (result.data && result.data.length > 0 && result.data[0].trackier_api_key) {
            const apiKey = result.data[0].trackier_api_key;
            
            // Parse if stored as JSON
            let parsedKey = apiKey;
            try {
                if (typeof apiKey === 'string' && (apiKey.startsWith('{') || apiKey.startsWith('['))) {
                    const parsed = JSON.parse(apiKey);
                    parsedKey = parsed.key || parsed.apiKey || parsed;
                }
            } catch (e) {
                parsedKey = apiKey;
            }

            const config = {
                apiKey: String(parsedKey).trim(),
                advertiserId: '3' // Default advertiser ID
            };

            console.log('Returning config:', { ...config, apiKey: config.apiKey.substring(0, 10) + '...' });
            return config;
        }

        throw new Error('Trackier API key not found in settings. Please configure it in Settings page.');
    } catch (error) {
        console.error('Error fetching Trackier config:', error);
        throw new Error('Failed to fetch Trackier configuration from settings');
    }
}

/**
 * Create Trackier campaign for the mapping
 */
async function createTrackierCampaign(offerName, accountId, campaignId) {
    try {
        // Fetch config from Supabase settings
        const trackierConfig = await getTrackierConfig();

        if (!trackierConfig || !trackierConfig.apiKey || !trackierConfig.advertiserId) {
            throw new Error('Invalid Trackier configuration');
        }

        // Ensure accountId and campaignId are strings
        const accountIdStr = String(accountId || '');
        const campaignIdStr = String(campaignId || '');

        // Generate campaign title
        const accountSuffix = accountIdStr.length >= 4 ? accountIdStr.slice(-4) : accountIdStr;
        const campaignSuffix = campaignIdStr.length >= 6 ? campaignIdStr.slice(-6) : campaignIdStr;
        const campaignTitle = `${offerName} - GGL ${accountSuffix} - ${campaignSuffix}`;

        console.log('Creating Trackier campaign:', { campaignTitle, advertiserId: trackierConfig.advertiserId });

        // Create campaign with required fields
        const response = await axios.post(
            `${TRACKIER_API_URL}/campaigns`,
            {
                title: campaignTitle,
                url: 'https://example.com', // Placeholder - will be updated via subIdOverride
                status: 'active',
                advertiserId: parseInt(trackierConfig.advertiserId),
                currency: 'USD',
                device: 'all',
                convTracking: 'iframe_https',
                convTrackingDomain: 'nebula.gotrackier.com',
                payouts: [{
                    currency: 'USD',
                    revenue: 0,
                    payout: 0,
                    geo: ['ALL']
                }],
                redirectType: '200_hrf', // HTTP first redirect
                subIdOverride: {
                    // Initial placeholder - will be updated via webhooks
                    p1: 'placeholder',
                    p2: 'placeholder',
                    p3: 'placeholder',
                    p5: 'placeholder'
                }
            },
            {
                headers: {
                    'X-Api-Key': trackierConfig.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Trackier API returns campaign object in response.data.campaign
        const campaignId_trackier = response.data.campaign?.id || response.data.id;
        
        if (!campaignId_trackier) {
            console.error('Trackier API response:', response.data);
            throw new Error('Invalid response from Trackier API - no campaign ID found');
        }

        // Generate webhook URL - will be processed by webhook-suffix-handler.js
        const baseUrl = process.env.PROXY_SERVICE_URL || 'http://localhost:3000';
        const webhookUrl = `${baseUrl}/api/webhook-suffix/receive/${campaignId_trackier}`;

        // Generate click URL
        const clickUrl = `https://nebula.gotrackier.com/click?campaign_id=${campaignId_trackier}`;

        return {
            success: true,
            campaignId: campaignId_trackier,
            webhookUrl,
            clickUrl,
            title: campaignTitle
        };

    } catch (error) {
        console.error('Error creating Trackier campaign:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

/**
 * Auto-create campaign mapping (called by Google Ads script on first run)
 * POST /api/webhook-campaign/auto-create
 * Body: {
 *   accountId: string,
 *   campaignId: string,
 *   campaignName: string,
 *   offerName: string
 * }
 * 
 * This endpoint:
 * 1. Checks if mapping already exists → returns existing if found
 * 2. Creates new mapping + Trackier campaign if not found
 * 3. Returns webhook URL for script to log
 */
router.post('/auto-create', async (req, res) => {
    try {
        const { accountId, campaignId, campaignName, offerName } = req.body;

        // Validate required fields
        if (!accountId || !campaignId || !offerName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: accountId, campaignId, offerName'
            });
        }

        // Check if mapping already exists
        const existingCheck = await supabase.get('/webhook_campaign_mappings', {
            params: {
                account_id: `eq.${accountId}`,
                campaign_id: `eq.${campaignId}`,
                select: '*'
            }
        });

        if (existingCheck.data && existingCheck.data.length > 0) {
            const existing = existingCheck.data[0];
            return res.json({
                success: true,
                alreadyExists: true,
                mapping: existing,
                trackier: {
                    campaignId: existing.trackier_campaign_id,
                    webhookUrl: existing.trackier_webhook_url,
                    clickUrl: `https://nebula.gotrackier.com/click?campaign_id=${existing.trackier_campaign_id}`
                },
                message: 'Mapping already exists'
            });
        }

        // Create new Trackier campaign
        const trackierCampaign = await createTrackierCampaign(offerName, campaignId);

        if (!trackierCampaign.success) {
            return res.status(500).json({
                success: false,
                error: `Failed to create Trackier campaign: ${trackierCampaign.error}`
            });
        }

        // Save mapping to database
        const mappingData = {
            account_id: accountId,
            campaign_id: campaignId,
            campaign_name: campaignName || `Campaign ${campaignId}`,
            offer_name: offerName,
            trackier_campaign_id: trackierCampaign.campaignId,
            trackier_webhook_url: trackierCampaign.webhookUrl,
            is_active: true,
            webhook_configured: false, // Not configured yet - user needs to add to Trackier
            created_by: 'google_ads_script_auto'
        };

        const result = await supabase.post('/webhook_campaign_mappings', mappingData);

        if (!result.data || result.data.length === 0) {
            throw new Error('Failed to save mapping to database');
        }

        const savedMapping = result.data[0];

        // Log creation
        await supabase.post('/webhook_suffix_usage_log', {
            mapping_id: savedMapping.mapping_id,
            action: 'auto_mapping_created',
            suffix: '',
            account_id: accountId,
            campaign_id: campaignId,
            metadata: {
                trackier_campaign_id: trackierCampaign.campaignId,
                offer_name: offerName,
                source: 'google_ads_script'
            }
        }).catch(err => console.error('Failed to log auto-creation:', err.message));

        res.json({
            success: true,
            autoCreated: true,
            mapping: savedMapping,
            trackier: {
                campaignId: trackierCampaign.campaignId,
                webhookUrl: trackierCampaign.webhookUrl,
                clickUrl: trackierCampaign.clickUrl
            },
            message: 'Auto-mapping created! Copy webhook URL and add to Trackier S2S postback.',
            instructions: `
⚠️ NEXT STEPS:
1. Log in to Trackier dashboard
2. Go to Campaign ${trackierCampaign.campaignId}
3. Add S2S Postback URL: ${trackierCampaign.webhookUrl}
4. System will auto-mark as configured when first webhook is received
            `.trim()
        });

    } catch (error) {
        console.error('Error auto-creating campaign mapping:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Mark webhook as configured (called when first webhook is received)
 * PATCH /api/webhook-campaign/:mappingId/mark-configured
 */
router.patch('/:mappingId/mark-configured', async (req, res) => {
    try {
        const { mappingId } = req.params;

        const result = await supabase.patch(`/webhook_campaign_mappings?mapping_id=eq.${mappingId}`, {
            webhook_configured: true,
            first_webhook_received_at: new Date().toISOString()
        });

        if (!result.data || result.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Mapping not found'
            });
        }

        res.json({
            success: true,
            mapping: result.data[0],
            message: 'Webhook marked as configured'
        });

    } catch (error) {
        console.error('Error marking webhook as configured:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
