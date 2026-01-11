// Supabase Edge Function: Trackier Webhook Handler
// 1. Logs webhook to database
// 2. Triggers background trace + Trackier URL 2 update

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Backend API for triggering traces - configurable via environment
const BACKEND_BASE_URL = Deno.env.get('BACKEND_BASE_URL') || 'http://localhost:3000'

console.log('🔧 Using BACKEND_BASE_URL:', BACKEND_BASE_URL)

Deno.serve(async (req) => {
  console.log('===== TRACKIER WEBHOOK =====')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    // Parse query parameters
    const url = new URL(req.url)
    const allParams = Object.fromEntries(url.searchParams)
    
    console.log('Query params:', allParams)
    
    const token = allParams.token || null
    const campaignId = allParams.campaign_id || 'unknown'
    const clickId = allParams.click_id || null
    
    console.log(`Token: ${token}, Campaign ID: ${campaignId}, Click ID: ${clickId}`)

    // Look up offer by token (simplest and most reliable)
    let offerId = null
    let trackierOffer = null
    if (token) {
      try {
        offerId = token // Token IS the offer UUID
        console.log('✅ Using token as offer ID:', offerId)
        
        // Fetch offer details for processing
        const { data: offer, error: offerError } = await supabase
          .from('trackier_offers')
          .select('*')
          .eq('id', offerId)
          .eq('enabled', true)
          .single()
        
        if (offer && !offerError) {
          trackierOffer = offer
          console.log('✅ Found offer:', offer.offer_name)
        } else {
          console.warn('⚠️ Offer not found or disabled:', offerError?.message)
        }
      } catch (e) {
        console.warn('⚠️ Invalid token format:', token)
      }
    } else {
      console.warn('⚠️ No token parameter in webhook payload')
    }

    // INSERT with offer mapping
    const { data: log, error: insertError } = await supabase
      .from('trackier_webhook_logs')
      .insert({
        trackier_offer_id: offerId,
        campaign_id: campaignId,
        click_id: clickId,
        payload: allParams,
        processed: false,
        queued_for_update: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ INSERT FAILED:', insertError.message, insertError)
      return new Response(
        JSON.stringify({ error: 'Database insert failed', details: insertError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Successfully logged webhook ID:', log.id)

    // TRIGGER BACKGROUND TRACE if offer found
    if (trackierOffer) {
      const now = new Date()
      const lastUpdate = trackierOffer.url2_last_updated_at 
        ? new Date(trackierOffer.url2_last_updated_at) 
        : new Date(0)
      const timeSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / 1000 // seconds

      const shouldUpdate = timeSinceLastUpdate >= (trackierOffer.update_interval_seconds || 300)

      console.log(`⏱️ Time since last update: ${timeSinceLastUpdate.toFixed(1)}s, Interval: ${trackierOffer.update_interval_seconds}s, Should update: ${shouldUpdate}`)

      if (shouldUpdate) {
        console.log('🚀 Triggering background trace...')
        
        // Mark as queued
        await supabase
          .from('trackier_webhook_logs')
          .update({ queued_for_update: true })
          .eq('id', log.id)

        // Trigger background trace via backend (fire and forget)
        try {
          const traceUrl = `${BACKEND_BASE_URL}/api/trackier-trace-background?offer_id=${offerId}&webhook_log_id=${log.id}`
          console.log('📡 Calling:', traceUrl)
          
          // Non-blocking call to backend
          fetch(traceUrl, { method: 'POST' })
            .then(r => console.log('📡 Backend trace triggered, status:', r.status))
            .catch(e => console.error('⚠️ Backend trace call failed:', e.message))
        } catch (e) {
          console.warn('⚠️ Could not trigger backend trace:', e.message)
        }
      } else {
        console.log(`⏱️ Skipping update (too soon, ${(trackierOffer.update_interval_seconds - timeSinceLastUpdate).toFixed(1)}s remaining)`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        webhook_id: log.id,
        offer_id: offerId,
        campaign_id: campaignId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ EXCEPTION:', error.message)
    return new Response(
      JSON.stringify({ error: 'Internal error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
