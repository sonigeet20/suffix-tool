// Conversion Tracking Postback Endpoint
// Handles conversion postbacks from affiliate networks
// Usage: /postback?click_id=XXX&payout=50.00&conversion_id=ABC123

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Handle conversion postback
 * Query params:
 * - click_id (required): The unique click identifier
 * - payout or conversion_value (optional): Conversion value/payout
 * - conversion_id or transaction_id (optional): Network's conversion ID
 * - status (optional): approved, pending, rejected
 */
async function handlePostback(req, res) {
  try {
    const { 
      click_id, 
      payout, 
      conversion_value, 
      conversion_id, 
      transaction_id,
      status = 'approved'
    } = req.query;

    // Validate required parameter
    if (!click_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: click_id'
      });
    }

    // Parse conversion value (accept both payout and conversion_value params)
    const conversionValue = parseFloat(payout || conversion_value || 0);
    const conversionId = conversion_id || transaction_id || `conv_${Date.now()}`;

    console.log(`[postback] Received conversion: click_id=${click_id}, value=${conversionValue}, status=${status}`);

    // Find the click event
    const { data: clickEvent, error: findError } = await supabase
      .from('google_ads_click_events')
      .select('*')
      .eq('click_id', click_id)
      .single();

    if (findError || !clickEvent) {
      console.error(`[postback] Click ID not found: ${click_id}`);
      return res.status(404).json({
        success: false,
        error: 'Click ID not found',
        click_id: click_id
      });
    }

    // Update the click event with conversion data
    const { error: updateError } = await supabase
      .from('google_ads_click_events')
      .update({
        conversion_tracked: status === 'approved',
        conversion_timestamp: new Date().toISOString(),
        conversion_value: conversionValue,
        conversion_id: conversionId,
        metadata: {
          ...clickEvent.metadata,
          conversion_status: status,
          conversion_received_at: new Date().toISOString()
        }
      })
      .eq('click_id', click_id);

    if (updateError) {
      console.error('[postback] Failed to update conversion:', updateError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to record conversion'
      });
    }

    console.log(`[postback] ✓ Conversion recorded: offer=${clickEvent.offer_name}, value=${conversionValue}`);

    // Return success response
    return res.json({
      success: true,
      message: 'Conversion recorded successfully',
      click_id: click_id,
      offer_name: clickEvent.offer_name,
      conversion_value: conversionValue,
      conversion_id: conversionId
    });

  } catch (error) {
    console.error('[postback] Exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Get conversion stats for an offer
 */
async function handleConversionStats(req, res) {
  try {
    const { offer_name, days = 7 } = req.query;

    const { data, error } = await supabase
      .rpc('get_parallel_tracking_stats', {
        p_offer_name: offer_name || null,
        p_days: parseInt(days)
      });

    if (error) {
      console.error('[conversion-stats] Query error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    return res.json({
      success: true,
      stats: data,
      period_days: parseInt(days)
    });

  } catch (error) {
    console.error('[conversion-stats] Exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  handlePostback,
  handleConversionStats
};
