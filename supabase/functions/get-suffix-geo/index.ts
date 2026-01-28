// Google Ads Geo Suffix Edge Function
// Generates and stores geo-targeted suffixes in pre-filled buckets
// This is STANDALONE - does not modify existing get-suffix function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GetSuffixGeoRequest {
  offer_name: string
  target_country: string // 'US', 'GB', 'ES', or 'US,GB,ES'
  count?: number // Number of suffixes to generate (default: 1)
  force_trace?: boolean // If true, always trace even if max_traces_per_day reached
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request
    const body: GetSuffixGeoRequest = await req.json()
    const { offer_name, target_country, count = 1, force_trace = false } = body

    if (!offer_name || !target_country) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: offer_name, target_country' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[get-suffix-geo] Generating ${count} suffixes for ${offer_name} in ${target_country}`)

    // Check if Google Ads feature is enabled
    const { data: settings } = await supabase
      .from('settings')
      .select('google_ads_enabled')
      .single()

    if (!settings?.google_ads_enabled) {
      return new Response(
        JSON.stringify({ error: 'Google Ads feature is disabled in settings' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch offer configuration
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, offer_name, url, google_ads_config, referrers, referrer_rotation_mode')
      .eq('offer_name', offer_name)
      .single()

    if (offerError || !offer) {
      return new Response(
        JSON.stringify({ error: `Offer not found: ${offer_name}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if Google Ads is enabled for this offer
    const googleAdsConfig = offer.google_ads_config || {}
    if (!googleAdsConfig.enabled) {
      return new Response(
        JSON.stringify({ error: `Google Ads not enabled for offer: ${offer_name}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check max_traces_per_day limit if configured
    if (!force_trace && googleAdsConfig.max_traces_per_day) {
      const { data: stats } = await supabase
        .from('google_ads_click_stats')
        .select('clicks_today')
        .eq('offer_name', offer_name)
        .eq('click_date', new Date().toISOString().split('T')[0])
        .single()

      if (stats && stats.clicks_today >= googleAdsConfig.max_traces_per_day) {
        console.log(`[get-suffix-geo] Daily limit reached for ${offer_name}: ${stats.clicks_today}/${googleAdsConfig.max_traces_per_day}`)
        return new Response(
          JSON.stringify({ 
            error: 'Daily trace limit reached',
            limit: googleAdsConfig.max_traces_per_day,
            used: stats.clicks_today
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Generate suffixes by calling trace-redirects function
    const results = []
    const errors = []

    for (let i = 0; i < count; i++) {
      try {
        // Call trace-redirects with same parameters as get-suffix does
        const traceResponse = await fetch(`${supabaseUrl}/functions/v1/trace-redirects`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: offer.url, // The tracking URL to trace
            max_redirects: 20,
            timeout_ms: 45000,
            user_id: offer.id,
            use_proxy: true,
            target_country: target_country,
            tracer_mode: 'http_only', // Fast HTTP-only tracing for Google Ads
            offer_id: offer.id,
          })
        })

        if (!traceResponse.ok) {
          const errorText = await traceResponse.text()
          console.error(`[get-suffix-geo] Trace failed for ${offer_name}: ${errorText}`)
          errors.push({ index: i, error: errorText })
          continue
        }

        const traceResult = await traceResponse.json()
        
        // Extract suffix from the redirect chain (like get-suffix does)
        if (!traceResult.success || !traceResult.chain || traceResult.chain.length === 0) {
          console.error(`[get-suffix-geo] Trace unsuccessful for ${offer_name}`)
          errors.push({ index: i, error: 'Trace failed or no redirect chain' })
          continue
        }

        const chain = traceResult.chain
        const stepIndex = 0 // Always use first redirect for Google Ads
        
        // Extract suffix from the configured step
        let suffix = null
        if (stepIndex < chain.length) {
          const step = chain[stepIndex]
          if (step.params && Object.keys(step.params).length > 0) {
            // Convert params object to URL query string
            suffix = new URLSearchParams(step.params).toString()
          } else if (step.url) {
            // Extract params from URL
            try {
              const urlObj = new URL(step.url)
              if (urlObj.search) {
                suffix = urlObj.search.substring(1) // Remove leading '?'
              }
            } catch (e) {
              console.error(`[get-suffix-geo] Failed to parse URL: ${step.url}`)
            }
          }
        }

        if (!suffix) {
          console.error(`[get-suffix-geo] No suffix extracted from trace for ${offer_name}`)
          errors.push({ index: i, error: 'No suffix extracted from trace' })
          continue
        }

        const finalUrl = traceResult.final_url || chain[chain.length - 1]?.url || offer.url
        const hopCount = chain.length

        // Store in geo_suffix_buckets
        const { data: inserted, error: insertError } = await supabase
          .from('geo_suffix_buckets')
          .insert({
            offer_name: offer_name,
            target_country: target_country,
            suffix: suffix,
            hop_count: hopCount,
            final_url: finalUrl || offer.url,
            traced_at: new Date().toISOString(),
            is_used: false,
            metadata: {
              trace_mode: 'http_only',
              applied_filters: googleAdsConfig.apply_filters || false,
              generated_by: 'get-suffix-geo'
            }
          })
          .select()
          .single()

        if (insertError) {
          // Handle duplicate suffix (constraint violation)
          if (insertError.code === '23505') {
            console.warn(`[get-suffix-geo] Duplicate suffix for ${offer_name}: ${suffix}`)
            errors.push({ index: i, error: 'Duplicate suffix generated' })
            continue
          }
          
          console.error(`[get-suffix-geo] Failed to insert suffix: ${insertError.message}`)
          errors.push({ index: i, error: insertError.message })
          continue
        }

        results.push({
          suffix: suffix,
          hop_count: hopCount,
          final_url: finalUrl,
          target_country: target_country,
          id: inserted.id
        })

        console.log(`[get-suffix-geo] Stored suffix ${i+1}/${count} for ${offer_name} (${target_country}): ${suffix}`)

      } catch (error) {
        console.error(`[get-suffix-geo] Exception generating suffix ${i+1}:`, error)
        errors.push({ index: i, error: error.message })
      }
    }

    // Return results
    return new Response(
      JSON.stringify({
        success: true,
        offer_name: offer_name,
        target_country: target_country,
        requested: count,
        generated: results.length,
        failed: errors.length,
        suffixes: results,
        errors: errors.length > 0 ? errors : undefined
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[get-suffix-geo] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
