const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const PROXY_SERVICE_URL = process.env.PROXY_SERVICE_URL || 'http://localhost:3000';

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
 * Receive webhook from Trackier S2S postback
 * GET /api/webhook-suffix/receive/:trackierCampaignId
 * 
 * Expected Trackier postback URL format:
 * {PROXY_SERVICE_URL}/api/webhook-suffix/receive/{campaign_id}?click_id={clickid}&txn_id={txn_id}&p1={p1}&p2={p2}&p3={p3}&p4={p4}&p5={p5}
 */
router.get('/receive/:trackierCampaignId', async (req, res) => {
    try {
        const { trackierCampaignId } = req.params;
        const webhookParams = req.query;

        console.log(`[Webhook] Received for Trackier Campaign ${trackierCampaignId}:`, webhookParams);

        // Find the mapping for this Trackier campaign
        const mappingResult = await supabase.get('/webhook_campaign_mappings', {
            params: {
                trackier_campaign_id: `eq.${trackierCampaignId}`,
                is_active: 'eq.true',
                select: '*'
            }
        });

        if (!mappingResult.data || mappingResult.data.length === 0) {
            console.log(`[Webhook] No active mapping found for Trackier Campaign ${trackierCampaignId}`);
            return res.status(404).json({
                success: false,
                error: 'No active mapping found for this Trackier campaign'
            });
        }

        const mapping = mappingResult.data[0];
        console.log(`[Webhook] Found mapping: ${mapping.offer_name} - Account ${mapping.account_id} - Campaign ${mapping.campaign_id}`);

        // Auto-mark webhook as configured on first webhook (if not already marked)
        if (!mapping.webhook_configured) {
            console.log(`[Webhook] First webhook received - marking as configured`);
            await supabase.patch(`/webhook_campaign_mappings?mapping_id=eq.${mapping.mapping_id}`, {
                webhook_configured: true,
                first_webhook_received_at: new Date().toISOString()
            }).catch(err => console.error('Failed to mark as configured:', err.message));
        }

        // Get next suffix from bucket
        const nextSuffix = await getNextSuffixFromBucket(mapping.mapping_id);

        if (!nextSuffix) {
            console.log(`[Webhook] No suffixes available in bucket for mapping ${mapping.mapping_id}`);
            
            // Trigger trace to generate new suffix
            const tracedSuffix = await triggerTraceAndStoreSuffix(mapping, webhookParams);
            
            if (!tracedSuffix) {
                return res.status(500).json({
                    success: false,
                    error: 'No suffixes in bucket and trace failed'
                });
            }

            // Queue the traced suffix for update
            await queueSuffixUpdate(mapping, tracedSuffix.suffix, webhookParams);
            
            return res.json({
                success: true,
                message: 'Suffix generated via trace and queued for update',
                suffix: tracedSuffix.suffix
            });
        }

        // Queue suffix update
        await queueSuffixUpdate(mapping, nextSuffix.suffix, webhookParams);

        // Mark suffix as used
        await markSuffixUsed(nextSuffix.suffix_id);

        // Log usage
        await supabase.post('/webhook_suffix_usage_log', {
            mapping_id: mapping.mapping_id,
            suffix_id: nextSuffix.suffix_id,
            suffix: nextSuffix.suffix,
            action: 'applied',
            account_id: mapping.account_id,
            campaign_id: mapping.campaign_id,
            webhook_data: webhookParams
        }).catch(err => console.error('Failed to log usage:', err.message));

        res.json({
            success: true,
            message: 'Suffix update queued',
            suffix: nextSuffix.suffix,
            bucket_remaining: nextSuffix.bucket_count - 1
        });

    } catch (error) {
        console.error('[Webhook] Error processing webhook:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get next suffix from bucket (uses PostgreSQL function)
 */
async function getNextSuffixFromBucket(mappingId) {
    try {
        const result = await supabase.post('/rpc/get_next_suffix_from_bucket', {
            p_mapping_id: mappingId
        });

        if (result.data && result.data.length > 0) {
            // Also get bucket count
            const countResult = await supabase.get('/webhook_suffix_bucket', {
                params: {
                    mapping_id: `eq.${mappingId}`,
                    is_valid: 'eq.true',
                    select: 'id'
                }
            });

            return {
                ...result.data[0],
                bucket_count: countResult.data.length
            };
        }

        return null;
    } catch (error) {
        console.error('Error getting suffix from bucket:', error);
        return null;
    }
}

/**
 * Mark suffix as used (uses PostgreSQL function)
 */
async function markSuffixUsed(suffixId) {
    try {
        await supabase.post('/rpc/mark_suffix_used', {
            p_suffix_id: suffixId
        });
    } catch (error) {
        console.error('Error marking suffix as used:', error);
    }
}

/**
 * Queue suffix update for Google Ads
 */
async function queueSuffixUpdate(mapping, suffix, webhookData) {
    try {
        const queueEntry = {
            mapping_id: mapping.mapping_id,
            account_id: mapping.account_id,
            campaign_id: mapping.campaign_id,
            new_suffix: suffix,
            status: 'pending',
            webhook_data: webhookData,
            priority: 5 // Default priority
        };

        await supabase.post('/webhook_suffix_update_queue', queueEntry);
        console.log(`[Queue] Added suffix update for ${mapping.account_id}/${mapping.campaign_id}`);
    } catch (error) {
        console.error('Error queuing suffix update:', error);
        throw error;
    }
}

/**
 * Trigger trace to generate new suffix and store in bucket
 */
async function triggerTraceAndStoreSuffix(mapping, webhookParams) {
    try {
        console.log(`[Trace] Triggering trace for mapping ${mapping.mapping_id}`);

        // Call the trace endpoint
        const traceUrl = mapping.trackier_webhook_url.replace('/api/webhook-suffix/receive/', '/trace?url=https://nebula.gotrackier.com/click?campaign_id=');
        
        const traceResponse = await axios.get(`${PROXY_SERVICE_URL}/trace`, {
            params: {
                url: `https://nebula.gotrackier.com/click?campaign_id=${mapping.trackier_campaign_id}`,
                geo: 'US',
                mode: 'browser'
            },
            timeout: 30000
        });

        if (!traceResponse.data || !traceResponse.data.finalUrl) {
            console.log('[Trace] No final URL in trace response');
            return null;
        }

        // Extract suffix from final URL
        const finalUrl = new URL(traceResponse.data.finalUrl);
        const suffix = finalUrl.search; // Includes the ?

        if (!suffix || suffix.length < 10) {
            console.log('[Trace] Invalid suffix extracted:', suffix);
            return null;
        }

        // Store in bucket
        const suffixHash = crypto.createHash('sha256').update(suffix).digest('hex');

        const bucketEntry = {
            mapping_id: mapping.mapping_id,
            suffix: suffix,
            suffix_hash: suffixHash,
            source: 'traced',
            is_valid: true,
            original_clicks: 0,
            fetched_from_date: new Date().toISOString().split('T')[0]
        };

        await supabase.post('/webhook_suffix_bucket', bucketEntry);

        // Log trace
        await supabase.post('/webhook_suffix_usage_log', {
            mapping_id: mapping.mapping_id,
            suffix: suffix,
            action: 'fetched',
            account_id: mapping.account_id,
            campaign_id: mapping.campaign_id,
            metadata: {
                source: 'traced',
                trigger: 'webhook',
                webhook_data: webhookParams
            }
        }).catch(err => console.error('Failed to log trace:', err.message));

        console.log(`[Trace] Stored traced suffix for ${mapping.offer_name}`);

        return { suffix };

    } catch (error) {
        console.error('[Trace] Error triggering trace:', error.message);
        return null;
    }
}

/**
 * Manual endpoint to add suffix to bucket
 * POST /api/webhook-suffix/add-to-bucket
 * Body: { mappingId: string, suffix: string, source: string }
 */
router.post('/add-to-bucket', async (req, res) => {
    try {
        const { mappingId, suffix, source = 'manual' } = req.body;

        if (!mappingId || !suffix) {
            return res.status(400).json({
                success: false,
                error: 'Missing mappingId or suffix'
            });
        }

        // Verify mapping exists
        const mappingCheck = await supabase.get('/webhook_campaign_mappings', {
            params: {
                mapping_id: `eq.${mappingId}`,
                select: 'id,offer_name,account_id,campaign_id'
            }
        });

        if (!mappingCheck.data || mappingCheck.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Mapping not found'
            });
        }

        const mapping = mappingCheck.data[0];

        // Generate hash
        const suffixHash = crypto.createHash('sha256').update(suffix).digest('hex');

        // Check for duplicates
        const dupCheck = await supabase.get('/webhook_suffix_bucket', {
            params: {
                suffix_hash: `eq.${suffixHash}`,
                select: 'id'
            }
        });

        if (dupCheck.data && dupCheck.data.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Suffix already exists in bucket'
            });
        }

        // Add to bucket
        const bucketEntry = {
            mapping_id: mappingId,
            suffix: suffix,
            suffix_hash: suffixHash,
            source: source,
            is_valid: true,
            fetched_from_date: new Date().toISOString().split('T')[0]
        };

        const result = await supabase.post('/webhook_suffix_bucket', bucketEntry);

        // Log addition
        await supabase.post('/webhook_suffix_usage_log', {
            mapping_id: mappingId,
            suffix: suffix,
            action: 'fetched',
            account_id: mapping.account_id,
            campaign_id: mapping.campaign_id,
            metadata: { source }
        }).catch(err => console.error('Failed to log addition:', err.message));

        res.json({
            success: true,
            message: 'Suffix added to bucket',
            suffix_id: result.data[0].id
        });

    } catch (error) {
        console.error('Error adding suffix to bucket:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check for webhook endpoint
 * GET /api/webhook-suffix/health
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'webhook-suffix-handler',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
