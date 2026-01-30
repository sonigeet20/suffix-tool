// Conversion Postback Handler Route
// Receives conversion postbacks from affiliate networks and maps to GCLID for Google Ads attribution
// Example: /conversion?click_id={xcust}&payout={payout}&status=approved

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Handle conversion postback from affiliate network
 * Maps affiliate click_id (xcust) back to GCLID for Google Ads conversion tracking
 */
async function handleConversion(req, res) {
  const startTime = Date.now();
  
  try {
    // Extract postback parameters (support both query and body)
    const params = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
    const { 
      click_id,   // xcust/subid - should match GCLID we passed
      xcust,      // Alternative parameter name
      payout,     // Conversion value
      status,     // Conversion status (approved, pending, rejected)
      currency,   // Currency code
      offer_id,   // Affiliate network offer ID
      transaction_id, // Unique transaction ID from network
    } = params;
    
    const actualClickId = click_id || xcust;
    
    if (!actualClickId) {
      return res.status(400).json({
        error: 'Missing required parameter: click_id or xcust',
        received: params
      });
    }
    
    console.log(`[conversion] Postback received: click_id=${actualClickId}, payout=${payout}, status=${status}`);
    
    // Look up GCLID from click mapping
    const { data: mapping, error: mappingError } = await supabase
      .from('gclid_click_mapping')
      .select('*')
      .eq('gclid', actualClickId) // We stored gclid in both gclid and click_id fields
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (mappingError || !mapping) {
      console.log(`[conversion] ⚠️  No GCLID mapping found for click_id: ${actualClickId}`);
      // Still accept the postback but log warning
      return res.status(200).json({
        status: 'accepted',
        message: 'Conversion recorded but no GCLID mapping found',
        click_id: actualClickId
      });
    }
    
    console.log(`[conversion] ✅ Found GCLID mapping: ${mapping.gclid} -> offer: ${mapping.offer_name}`);
    
    // Only track approved conversions
    if (status && status.toLowerCase() !== 'approved') {
      console.log(`[conversion] ⏭️  Skipping non-approved conversion: status=${status}`);
      return res.status(200).json({
        status: 'skipped',
        message: 'Only approved conversions are tracked',
        conversion_status: status
      });
    }
    
    // Store conversion in database
    const { data: conversion, error: conversionError } = await supabase
      .from('google_ads_conversions')
      .insert({
        gclid: mapping.gclid,
        offer_name: mapping.offer_name,
        click_id: actualClickId,
        conversion_value: payout ? parseFloat(payout) : null,
        conversion_currency: currency || 'USD',
        postback_data: params,
        reported_to_google: false
      })
      .select()
      .single();
      
    if (conversionError) {
      console.error('[conversion] Failed to store conversion:', conversionError);
      return res.status(500).json({
        error: 'Failed to store conversion',
        details: conversionError.message
      });
    }
    
    console.log(`[conversion] 💰 Conversion stored: ${conversion.id} (gclid: ${mapping.gclid}, value: ${payout})`);
    
    // TODO: Report conversion to Google Ads API (future enhancement)
    // This would require Google Ads API credentials and conversion action ID
    // For now, conversions are stored and can be manually reported or batch processed
    
    const processingTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'success',
      message: 'Conversion tracked successfully',
      conversion_id: conversion.id,
      gclid: mapping.gclid,
      offer_name: mapping.offer_name,
      processing_time_ms: processingTime
    });
    
  } catch (error) {
    console.error('[conversion] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

module.exports = {
  handleConversion
};
