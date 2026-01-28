// Fill Geo Buckets Edge Function
// Populates geo_suffix_buckets with pre-traced suffixes for an offer
// Call this manually or via cron to maintain bucket levels

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FillBucketsRequest {
  offer_name: string
  single_geo_targets?: string[] // e.g., ['US', 'GB', 'ES']
  multi_geo_targets?: string[] // e.g., ['US,GB,ES', 'US,GB']
  single_geo_count?: number // Suffixes per single geo (default: 30)
  multi_geo_count?: number // Suffixes per multi geo (default: 10)
  force?: boolean // Bypass daily limits
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
    const body: FillBucketsRequest = await req.json()
    const { 
      offer_name, 
      single_geo_targets = ['US', 'GB', 'ES', 'DE', 'FR', 'IT', 'CA', 'AU'],
      multi_geo_targets = ['US,GB,ES', 'US,GB,DE', 'US,CA,AU'],
      single_geo_count = 30,
      multi_geo_count = 10,
      force = false
    } = body

    if (!offer_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: offer_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[fill-geo-buckets] Starting bucket fill for ${offer_name}`)
    console.log(`[fill-geo-buckets] Single geo: ${single_geo_targets.length} countries x ${single_geo_count} = ${single_geo_targets.length * single_geo_count}`)
    console.log(`[fill-geo-buckets] Multi geo: ${multi_geo_targets.length} groups x ${multi_geo_count} = ${multi_geo_targets.length * multi_geo_count}`)

    // Check if feature is enabled
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

    // Verify offer exists and Google Ads is enabled
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, offer_name, google_ads_config')
      .eq('offer_name', offer_name)
      .single()

    if (offerError || !offer) {
      return new Response(
        JSON.stringify({ error: `Offer not found: ${offer_name}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const googleAdsConfig = offer.google_ads_config || {}
    if (!googleAdsConfig.enabled) {
      return new Response(
        JSON.stringify({ error: `Google Ads not enabled for offer: ${offer_name}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get current bucket status
    const { data: currentStats } = await supabase
      .rpc('get_bucket_stats', { p_offer_name: offer_name })

    console.log('[fill-geo-buckets] Current bucket status:', currentStats)

    // Track results
    const results = {
      offer_name,
      single_geo: [] as any[],
      multi_geo: [] as any[],
      total_requested: 0,
      total_generated: 0,
      total_failed: 0,
      duration_ms: 0
    }

    const startTime = Date.now()

    // Fill single geo buckets
    for (const country of single_geo_targets) {
      try {
        // Check if bucket needs filling
        const currentStat = currentStats?.find((s: any) => s.target_country === country)
        const availableSuffixes = currentStat?.available_suffixes || 0

        if (availableSuffixes >= single_geo_count && !force) {
          console.log(`[fill-geo-buckets] Skipping ${country} - already has ${availableSuffixes} suffixes`)
          results.single_geo.push({
            country,
            status: 'skipped',
            reason: 'sufficient_suffixes',
            available: availableSuffixes
          })
          continue
        }

        const needed = single_geo_count - availableSuffixes
        console.log(`[fill-geo-buckets] Filling ${country} with ${needed} suffixes`)

        // Generate suffixes for this geo using the existing get-suffix function
        let successCount = 0
        let failCount = 0
        
        for (let i = 0; i < needed; i++) {
          try {
            // Call existing get-suffix function with offer_name as URL parameter
            const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offer_name)}`
            const suffixResponse = await fetch(getSuffixUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
              }
            })

            if (!suffixResponse.ok) {
              const errorText = await suffixResponse.text()
              console.error(`[fill-geo-buckets] get-suffix failed for ${country}: ${errorText}`)
              failCount++
              continue
            }

            const suffixResult = await suffixResponse.json()
            
            // Extract suffix from get-suffix response
            const suffix = suffixResult.suffix || suffixResult.tracking_suffix
            if (!suffix) {
              console.error(`[fill-geo-buckets] No suffix in response for ${country}`)
              failCount++
              continue
            }

            // Store in geo_suffix_buckets
            const { error: insertError } = await supabase
              .from('geo_suffix_buckets')
              .insert({
                offer_name: offer_name,
                target_country: country,
                suffix: suffix,
                hop_count: suffixResult.hop_count || 0,
                final_url: suffixResult.final_url || offer.url,
                traced_at: new Date().toISOString(),
                is_used: false,
                metadata: {
                  trace_mode: suffixResult.mode_used || 'http_only',
                  generated_by: 'fill-geo-buckets'
                }
              })

            if (insertError) {
              // Handle duplicate suffix
              if (insertError.code === '23505') {
                console.warn(`[fill-geo-buckets] Duplicate suffix for ${country}`)
                failCount++
                continue
              }
              console.error(`[fill-geo-buckets] Failed to insert suffix: ${insertError.message}`)
              failCount++
              continue
            }

            successCount++
          } catch (err: any) {
            console.error(`[fill-geo-buckets] Error generating suffix for ${country}:`, err)
            failCount++
          }
        }

        results.single_geo.push({
          country,
          status: 'filled',
          requested: needed,
          generated: successCount,
          failed: failCount
        })
        results.total_requested += needed
        results.total_generated += successCount
        results.total_failed += failCount

      } catch (err: any) {
        console.error(`[fill-geo-buckets] Error processing ${country}:`, err)
        results.single_geo.push({
          country,
          status: 'error',
          error: err.message
        })
      }
    }

    // Fill multi-geo buckets
    for (const geoGroup of multi_geo_targets) {
      try {
        // Check if bucket needs filling
        const currentStat = currentStats?.find((s: any) => s.target_country === geoGroup)
        const availableSuffixes = currentStat?.available_suffixes || 0

        if (availableSuffixes >= multi_geo_count && !force) {
          console.log(`[fill-geo-buckets] Skipping ${geoGroup} - already has ${availableSuffixes} suffixes`)
          results.multi_geo.push({
            geo_group: geoGroup,
            status: 'skipped',
            reason: 'sufficient_suffixes',
            available: availableSuffixes
          })
          continue
        }

        const needed = multi_geo_count - availableSuffixes
        console.log(`[fill-geo-buckets] Filling ${geoGroup} with ${needed} suffixes`)

        // Generate suffixes for this geo group using the existing get-suffix function
        let successCount = 0
        let failCount = 0
        
        for (let i = 0; i < needed; i++) {
          try {
            // Call existing get-suffix function with offer_name as URL parameter
            const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offer_name)}`
            const suffixResponse = await fetch(getSuffixUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
              }
            })

            if (!suffixResponse.ok) {
              const errorText = await suffixResponse.text()
              console.error(`[fill-geo-buckets] get-suffix failed for ${geoGroup}: ${errorText}`)
              failCount++
              continue
            }

            const suffixResult = await suffixResponse.json()
            
            // Extract suffix from get-suffix response
            const suffix = suffixResult.suffix || suffixResult.tracking_suffix
            if (!suffix) {
              console.error(`[fill-geo-buckets] No suffix in response for ${geoGroup}`)
              failCount++
              continue
            }

            // Store in geo_suffix_buckets
            const { error: insertError } = await supabase
              .from('geo_suffix_buckets')
              .insert({
                offer_name: offer_name,
                target_country: geoGroup,
                suffix: suffix,
                hop_count: suffixResult.hop_count || 0,
                final_url: suffixResult.final_url || offer.url,
                traced_at: new Date().toISOString(),
                is_used: false,
                metadata: {
                  trace_mode: suffixResult.mode_used || 'http_only',
                  generated_by: 'fill-geo-buckets'
                }
              })

            if (insertError) {
              if (insertError.code === '23505') {
                console.warn(`[fill-geo-buckets] Duplicate suffix for ${geoGroup}`)
                failCount++
                continue
              }
              console.error(`[fill-geo-buckets] Failed to insert suffix: ${insertError.message}`)
              failCount++
              continue
            }

            successCount++
          } catch (err: any) {
            console.error(`[fill-geo-buckets] Error generating suffix for ${geoGroup}:`, err)
            failCount++
          }
        }

        results.multi_geo.push({
          geo_group: geoGroup,
          status: 'filled',
          requested: needed,
          generated: successCount,
          failed: failCount
        })
        results.total_requested += needed
        results.total_generated += successCount
        results.total_failed += failCount

      } catch (error) {
        console.error(`[fill-geo-buckets] Exception filling ${geoGroup}:`, error)
        results.multi_geo.push({
          geo_group: geoGroup,
          status: 'exception',
          error: error.message
        })
      }
    }

    results.duration_ms = Date.now() - startTime

    console.log(`[fill-geo-buckets] Completed in ${results.duration_ms}ms`)
    console.log(`[fill-geo-buckets] Generated: ${results.total_generated}/${results.total_requested}, Failed: ${results.total_failed}`)

    return new Response(
      JSON.stringify({
        success: true,
        ...results
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[fill-geo-buckets] Fatal error:', error)
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
