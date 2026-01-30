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
    if (multi_geo_count > 0) {
      console.log(`[fill-geo-buckets] Multi geo: ${multi_geo_targets.length} groups x ${multi_geo_count} = ${multi_geo_targets.length * multi_geo_count}`)
    } else {
      console.log(`[fill-geo-buckets] Multi geo: SKIPPED (count = 0)`)
    }

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
      .select('id, offer_name, google_ads_config, target_country, geo_pool')
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

    // Validate that requested geos match the offer's target_country or geo_pool
    let offerTargetGeo = offer.target_country
    let offerGeoPool: string[] = []
    
    // If target_country is blank, use geo_pool
    if (!offerTargetGeo && offer.geo_pool && Array.isArray(offer.geo_pool) && offer.geo_pool.length > 0) {
      offerGeoPool = offer.geo_pool as string[]
      console.log(`[fill-geo-buckets] Using geo_pool for offer: ${offerGeoPool.join(', ')}`)
    } else if (offerTargetGeo) {
      console.log(`[fill-geo-buckets] Using target_country for offer: ${offerTargetGeo}`)
    } else {
      console.log(`[fill-geo-buckets] No target_country or geo_pool configured - allowing all requested geos`)
    }
    
    let filteredMultiGeoTargets = multi_geo_targets
    let actualMultiGeoCount = multi_geo_count
    
    if (offerTargetGeo || offerGeoPool.length > 0) {
      // Determine allowed geos
      const allowedGeos = offerTargetGeo ? [offerTargetGeo] : offerGeoPool
      
      // For target_country (single geo), validate single_geo_targets includes it
      if (offerTargetGeo) {
        if (!single_geo_targets.includes(offerTargetGeo)) {
          return new Response(
            JSON.stringify({ 
              error: `Single geo targets must include offer target country: ${offerTargetGeo}`,
              offer_target: offerTargetGeo,
              requested_singles: single_geo_targets
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      // For geo_pool (multiple geos), validate single_geo_targets are subset of geo_pool
      if (offerGeoPool.length > 0) {
        const invalidGeos = single_geo_targets.filter(g => !offerGeoPool.includes(g))
        if (invalidGeos.length > 0) {
          return new Response(
            JSON.stringify({ 
              error: `Single geo targets must be subset of offer geo_pool`,
              offer_geo_pool: offerGeoPool,
              requested_singles: single_geo_targets,
              invalid_geos: invalidGeos
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      // For multi_geo_targets, filter to only groups containing allowed geos
      filteredMultiGeoTargets = multi_geo_targets.filter(group => {
        const geoList = group.split(',').map(g => g.trim())
        // All geos in the group must be in allowedGeos
        return geoList.every(g => allowedGeos.includes(g))
      })
      
      if (filteredMultiGeoTargets.length < multi_geo_targets.length) {
        console.warn(
          `[fill-geo-buckets] Filtering multi-geo groups to match allowed geos`,
          { 
            allowed: allowedGeos,
            provided: multi_geo_targets,
            filtered: filteredMultiGeoTargets,
            excluded: multi_geo_targets.filter(g => !filteredMultiGeoTargets.includes(g))
          }
        )
      }
      
      // For single-geo-only offers, skip multi-geo buckets
      if (allowedGeos.length === 1 && single_geo_targets.length === 1 && single_geo_targets[0] === allowedGeos[0]) {
        actualMultiGeoCount = 0
        console.log(`[fill-geo-buckets] Single-geo offer (${allowedGeos[0]}) - skipping multi-geo buckets`)
      }
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

    // Fill single geo buckets (parallel per country)
    const singleGeoResults = await Promise.all(
      single_geo_targets.map(async (country) => {
        try {
          // Check if bucket needs filling
          const currentStat = currentStats?.find((s: any) => s.target_country === country)
          const availableSuffixes = currentStat?.available_suffixes || 0

          if (availableSuffixes >= single_geo_count && !force) {
            console.log(`[fill-geo-buckets] Skipping ${country} - already has ${availableSuffixes} suffixes`)
            return {
              entry: {
                country,
                status: 'skipped',
                reason: 'sufficient_suffixes',
                available: availableSuffixes
              },
              requested: 0,
              generated: 0,
              failed: 0
            }
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

          return {
            entry: {
              country,
              status: 'filled',
              requested: needed,
              generated: successCount,
              failed: failCount
            },
            requested: needed,
            generated: successCount,
            failed: failCount
          }

        } catch (err: any) {
          console.error(`[fill-geo-buckets] Error processing ${country}:`, err)
          return {
            entry: {
              country,
              status: 'error',
              error: err.message
            },
            requested: 0,
            generated: 0,
            failed: 0
          }
        }
      })
    )

    for (const result of singleGeoResults) {
      results.single_geo.push(result.entry)
      results.total_requested += result.requested
      results.total_generated += result.generated
      results.total_failed += result.failed
    }

    // Fill multi-geo buckets (parallel per group) - skip if count is 0
    const multiGeoResults = actualMultiGeoCount > 0 ? await Promise.all(
      filteredMultiGeoTargets.map(async (geoGroup) => {
        try {
          // Check if bucket needs filling
          const currentStat = currentStats?.find((s: any) => s.target_country === geoGroup)
          const availableSuffixes = currentStat?.available_suffixes || 0

          if (availableSuffixes >= actualMultiGeoCount && !force) {
            console.log(`[fill-geo-buckets] Skipping ${geoGroup} - already has ${availableSuffixes} suffixes`)
            return {
              entry: {
                geo_group: geoGroup,
                status: 'skipped',
                reason: 'sufficient_suffixes',
                available: availableSuffixes
              },
              requested: 0,
              generated: 0,
              failed: 0
            }
          }

          const needed = actualMultiGeoCount - availableSuffixes
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

          return {
            entry: {
              geo_group: geoGroup,
              status: 'filled',
              requested: needed,
              generated: successCount,
              failed: failCount
            },
            requested: needed,
            generated: successCount,
            failed: failCount
          }

        } catch (error) {
          console.error(`[fill-geo-buckets] Exception filling ${geoGroup}:`, error)
          return {
            entry: {
              geo_group: geoGroup,
              status: 'exception',
              error: error.message
            },
            requested: 0,
            generated: 0,
            failed: 0
          }
        }
      })
    ) : []

    for (const result of multiGeoResults) {
      results.multi_geo.push(result.entry)
      results.total_requested += result.requested
      results.total_generated += result.generated
      results.total_failed += result.failed
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
