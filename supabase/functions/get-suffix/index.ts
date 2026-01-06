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
}

function selectByMode(
  items: Array<TrackingUrlEntry | ReferrerEntry>,
  mode: string,
  currentIndex: number
): { selected: TrackingUrlEntry | ReferrerEntry; newIndex: number } | null {
  // Treat missing enabled flag as enabled for backward compatibility
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

async function updateUsageStats(
  supabase: any,
  offerId: string,
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

    const url = new URL(req.url);
    const offerName = url.searchParams.get('offer_name');
    const debug = url.searchParams.get('debug') === 'true'; // NEW: Debug flag for bandwidth info
    const campaignCount = parseInt(url.searchParams.get('campaign_count') || '1', 10); // Number of unique suffixes needed

    if (!offerName) {
      return new Response(
        JSON.stringify({ error: 'offer_name parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('offer_name', offerName)
      .eq('is_active', true)
      .maybeSingle();

    console.log(`🔍 Searching for offer: ${offerName}`);
    if (offerError) {
      console.error('❌ Error fetching offer:', offerError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: offerError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    if (!offer) {
      console.warn(`⚠️ Offer not found: ${offerName}`);
      return new Response(
        JSON.stringify({ error: 'Offer not found or inactive', offer_name: offerName }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    console.log(`✅ Found offer: ${offer.offer_name}, active: ${offer.is_active}, tracking_urls: ${offer.tracking_urls?.length || 0}, tracer_mode: ${offer.tracer_mode || 'auto'}, redirect_chain_step: ${offer.redirect_chain_step || 0}`);

    let trackingUrlToUse: string | null = null;
    let trackingUrlLabel = '';
    let trackingUrlWeight = 0;
    let trackingUrlIndex = 0;
    let referrerToUse: string | null = null;
    let referrerLabel = '';
    let referrerWeight = 0;
    let referrerIndex = 0;
    let newTrackingUrlIndex = offer.current_tracking_url_index || 0;
    let newReferrerIndex = offer.current_referrer_index || 0;

    const trackingUrls = offer.tracking_urls || [];
    const referrers = offer.referrers || [];
    const trackingUrlRotationMode = offer.tracking_url_rotation_mode || 'sequential';
    const referrerRotationMode = offer.referrer_rotation_mode || 'sequential';

    console.log(`📊 Offer configuration: tracking_urls=${trackingUrls.length}, referrers=${referrers.length}, tracking_template=${offer.tracking_template ? 'yes' : 'no'}`);

    if (trackingUrls.length > 0) {
      const trackingSelection = selectByMode(
        trackingUrls,
        trackingUrlRotationMode,
        offer.current_tracking_url_index || 0
      );

      if (trackingSelection) {
        trackingUrlToUse = trackingSelection.selected.url;
        trackingUrlLabel = trackingSelection.selected.label || '';
        trackingUrlWeight = trackingSelection.selected.weight || 1;
        trackingUrlIndex = trackingSelection.newIndex;
        newTrackingUrlIndex = trackingSelection.newIndex;
      }
    } else if (offer.tracking_template) {
      trackingUrlToUse = offer.tracking_template;
      trackingUrlLabel = 'Legacy Template';
    }

    if (referrers.length > 0) {
      const referrerSelection = selectByMode(
        referrers,
        referrerRotationMode,
        offer.current_referrer_index || 0
      );

      if (referrerSelection) {
        referrerToUse = referrerSelection.selected.url;
        referrerLabel = referrerSelection.selected.label || '';
        referrerWeight = referrerSelection.selected.weight || 1;
        referrerIndex = referrerSelection.newIndex;
        newReferrerIndex = referrerSelection.newIndex;
      }
    } else if (offer.custom_referrer) {
      referrerToUse = offer.custom_referrer;
      referrerLabel = 'Legacy Custom Referrer';
    }

    await supabase
      .from('offers')
      .update({
        current_tracking_url_index: newTrackingUrlIndex,
        current_referrer_index: newReferrerIndex,
      })
      .eq('id', offer.id);

    let finalSuffix = '';
    let extractedParams: Record<string, string> = {};
    let filteredParams: Record<string, string> = {};
    let traceSuccessful = false;
    let attemptCount = 0;
    let proxyIp: string | null = null;
    let lastTraceError: string | null = null;
    let lastTraceStatus: number | null = null;
    let traceBandwidth_bytes = 0;  // Track trace bandwidth in bytes
    let tracedFinalUrl: string | null = null;  // Actual final URL from trace
    let usedUserAgent: string | null = null;  // Track which user agent was used
    let selectedGeo: string | null = null;  // Track selected geo country
    let geoLocation: any = null;  // Track geo location details
    
    // For multiple campaigns: store all unique suffixes
    const multipleSuffixes: Array<{
      suffix: string;
      params_extracted: Record<string, string>;
      params_filtered: Record<string, string>;
      proxy_ip: string | null;
      user_agent: string | null;
      selected_geo: string | null;
      geo_location: any;
    }> = [];

    if (trackingUrlToUse) {
      const retryLimit = offer.retry_limit || 3;
      const retryDelay = offer.retry_delay_ms || 2000;

      console.log(`🚀 Starting trace attempts for tracking URL: ${trackingUrlToUse}`);
      console.log(`   Campaign count: ${campaignCount}, Referrer: ${referrerToUse || 'none'}, Retry limit: ${retryLimit}, Delay: ${retryDelay}ms`);

      // Loop for each campaign that needs unique params
      for (let campaignIndex = 0; campaignIndex < campaignCount; campaignIndex++) {
        console.log(`\n📍 Generating unique suffix ${campaignIndex + 1}/${campaignCount}`);
        
        // Reset per-campaign variables
        let campaignSuffix = '';
        let campaignParams: Record<string, string> = {};
        let campaignFiltered: Record<string, string> = {};
        let campaignProxyIp: string | null = null;
        let campaignUserAgent: string | null = null;
        let campaignGeo: string | null = null;
        let campaignGeoLocation: any = null;
        let campaignTraceSuccess = false;

      for (let attempt = 0; attempt <= retryLimit; attempt++) {
        attemptCount = attempt + 1;

        if (attempt > 0) {
          console.log(`Retry attempt ${attempt}/${retryLimit} after ${retryDelay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        try {
          // Extract hostname from final_url if it's a full URL
          let expectedFinalUrl = offer.expected_final_url || offer.final_url || null;
          if (expectedFinalUrl) {
            try {
              const urlObj = new URL(expectedFinalUrl);
              expectedFinalUrl = urlObj.hostname.replace(/^www\./, '');
            } catch (e) {
              // If it's already just a hostname, keep it as is
              expectedFinalUrl = expectedFinalUrl.replace(/^www\./, '');
            }
          }

          const traceRequestBody: any = {
            url: trackingUrlToUse,
            max_redirects: 20,
            timeout_ms: 45000,
            // user_agent removed - let proxy service handle rotation
            user_id: offer.user_id,
            use_proxy: true,
            target_country: offer.target_country || null,
            tracer_mode: offer.tracer_mode || 'auto',
            suffix_step: offer.redirect_chain_step || null,
            expected_final_url: expectedFinalUrl,
          };

          // Add geo rotation parameters if configured
          if (offer.geo_pool && offer.geo_pool.length > 0) {
            traceRequestBody.geo_pool = offer.geo_pool;
            traceRequestBody.geo_strategy = offer.geo_strategy || 'round_robin';
            if (offer.geo_weights) {
              traceRequestBody.geo_weights = offer.geo_weights;
            }
            console.log(`🌍 Geo rotation: pool=${offer.geo_pool.join(',')}, strategy=${traceRequestBody.geo_strategy}`);
          }

          // Add device distribution if configured (for user agent generation)
          if (offer.device_distribution && Array.isArray(offer.device_distribution) && offer.device_distribution.length > 0) {
            traceRequestBody.device_distribution = offer.device_distribution;
            console.log(`📱 Device distribution: ${JSON.stringify(offer.device_distribution)}`);
          }

          console.log(`📡 Trace request - tracer_mode: ${traceRequestBody.tracer_mode}, url: ${trackingUrlToUse.substring(0, 80)}`);

          if (referrerToUse) {
            traceRequestBody.referrer = referrerToUse;
          }

          const traceResponse = await fetch(`${supabaseUrl}/functions/v1/trace-redirects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(traceRequestBody),
          });

          if (traceResponse.ok) {
            const traceResult = await traceResponse.json();
            if (traceResult.bandwidth_bytes) {
              traceBandwidth_bytes = Math.max(traceBandwidth_bytes, traceResult.bandwidth_bytes);  // Track peak bandwidth
            }
            console.log('📦 Trace result:', JSON.stringify({
              success: traceResult.success,
              chain_length: traceResult.chain?.length,
              proxy_used: traceResult.proxy_used,
              proxy_ip: traceResult.proxy_ip,
              bandwidth_bytes: traceResult.bandwidth_bytes,
              geo_location: traceResult.geo_location,
            }));

            if (traceResult.success && traceResult.chain && traceResult.chain.length > 0) {
              const chain = traceResult.chain;
              const stepIndex = offer.redirect_chain_step || 0;
              
              // Capture the actual final URL from the trace
              tracedFinalUrl = chain[chain.length - 1].url;

              if (stepIndex < chain.length) {
                const selectedStep = chain[stepIndex];

                let paramsToUse = selectedStep.params || {};

                if (Object.keys(paramsToUse).length === 0 && selectedStep.url) {
                  try {
                    const urlObj = new URL(selectedStep.url);
                    const urlParams: Record<string, string> = {};
                    urlObj.searchParams.forEach((value, key) => {
                      urlParams[key] = value;
                    });
                    if (Object.keys(urlParams).length > 0) {
                      paramsToUse = urlParams;
                      console.log(`Extracted params from URL query string of step ${stepIndex + 1}`);
                    }
                  } catch (e) {
                    console.log(`Could not parse URL for step ${stepIndex + 1}`);
                  }
                }

                if (Object.keys(paramsToUse).length === 0 && stepIndex > 0) {
                  const prevStep = chain[stepIndex - 1];
                  if (prevStep.headers && prevStep.headers.location) {
                    try {
                      const locationUrl = new URL(prevStep.headers.location, selectedStep.url);
                      const locationParams: Record<string, string> = {};
                      locationUrl.searchParams.forEach((value, key) => {
                        locationParams[key] = value;
                      });
                      if (Object.keys(locationParams).length > 0) {
                        paramsToUse = locationParams;
                        console.log(`Extracted params from Location header of step ${stepIndex}`);
                      }
                    } catch (e) {
                      console.log(`Could not parse Location header from step ${stepIndex}`);
                    }
                  }
                }

                if (Object.keys(paramsToUse).length > 0) {
                  campaignParams = paramsToUse;

                  const paramFilterMode = offer.param_filter_mode || 'all';
                  const paramFilter = offer.param_filter || [];
                  campaignFiltered = filterParams(campaignParams, paramFilterMode, paramFilter);

                  const params = new URLSearchParams(campaignFiltered);
                  campaignSuffix = params.toString();
                  campaignTraceSuccess = true;
                  const status = selectedStep.error ? 'error' : `status ${selectedStep.status}`;
                  console.log(`✅ Campaign ${campaignIndex + 1}: Extracted ${Object.keys(campaignParams).length} params, filtered to ${Object.keys(campaignFiltered).length} params from step ${stepIndex + 1}/${chain.length} (${status})`);
                  
                  // Store for first campaign (backward compatibility)
                  if (campaignIndex === 0) {
                    extractedParams = campaignParams;
                    filteredParams = campaignFiltered;
                    finalSuffix = campaignSuffix;
                    traceSuccessful = true;
                  }
                }
              } else {
                console.error(`Configured step ${stepIndex + 1} exceeds chain length ${chain.length}`);
              }

              if (traceResult.proxy_ip) {
                campaignProxyIp = traceResult.proxy_ip;
                console.log('✅ Campaign proxy IP:', campaignProxyIp);
                if (campaignIndex === 0) proxyIp = campaignProxyIp;
              }

              if (traceResult.user_agent) {
                campaignUserAgent = traceResult.user_agent;
                console.log('✅ Campaign user agent:', campaignUserAgent);
                if (campaignIndex === 0) usedUserAgent = campaignUserAgent;
              }

              if (traceResult.selected_geo) {
                campaignGeo = traceResult.selected_geo;
                console.log('✅ Campaign geo:', campaignGeo);
                if (campaignIndex === 0) selectedGeo = campaignGeo;
              }

              if (traceResult.geo_location) {
                campaignGeoLocation = traceResult.geo_location;
                console.log('✅ Campaign geo location:', campaignGeoLocation);
                if (campaignIndex === 0) geoLocation = campaignGeoLocation;
              }

              if (traceSuccessful && traceResult.proxy_ip) {
                await supabase.from('url_traces').insert({
                  offer_id: offer.id,
                  user_id: offer.user_id,
                  redirect_chain: chain,
                  final_url: chain[chain.length - 1].url,
                  proxy_ip: traceResult.proxy_ip,
                  geo_country: traceResult.geo_location?.country,
                  geo_city: traceResult.geo_location?.city,
                  geo_region: traceResult.geo_location?.region,
                  geo_data: traceResult.geo_location,
                  device_type: 'bot',
                  user_agent: traceResult.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  visited_at: new Date().toISOString(),
                  tracking_url_used: trackingUrlToUse,
                  referrer_used: referrerToUse,
                });
              }

              // Only update offer chain for first campaign
              if (campaignIndex === 0) {
                await supabase.from('offers').update({
                  last_traced_chain: chain,
                  last_trace_date: new Date().toISOString(),
                }).eq('id', offer.id);
              }

              break;
            } else {
              console.error(`Trace attempt ${attemptCount} returned empty chain`);
            }
          } else {
            const errorText = await traceResponse.text();
            lastTraceError = errorText;
            lastTraceStatus = traceResponse.status;
            console.error(`❌ Trace attempt ${attemptCount} failed with status ${traceResponse.status}:`, errorText);
            console.error(`   Request was: POST ${supabaseUrl}/functions/v1/trace-redirects`);
          }

          if (attempt === retryLimit) {
            console.error(`❌ All retry attempts exhausted for ${trackingUrlToUse}, no trace completed`);
          }
        } catch (traceError: any) {
          lastTraceError = traceError.message;
          console.error(`Trace attempt ${attemptCount} failed:`, traceError.message);

          if (attempt === retryLimit) {
            console.error(`Campaign ${campaignIndex + 1}: All retry attempts exhausted, no params extracted`);
          }
        }
      }
      
      // Store this campaign's result
      if (campaignTraceSuccess && campaignSuffix) {
        multipleSuffixes.push({
          suffix: campaignSuffix,
          params_extracted: campaignParams,
          params_filtered: campaignFiltered,
          proxy_ip: campaignProxyIp,
          user_agent: campaignUserAgent,
          selected_geo: campaignGeo,
          geo_location: campaignGeoLocation,
        });
        console.log(`✅ Campaign ${campaignIndex + 1}: Suffix stored (${campaignSuffix.substring(0, 50)}...)`);
      } else {
        console.error(`❌ Campaign ${campaignIndex + 1}: Failed to generate suffix`);
      }
      
      // Add delay between campaigns to avoid rate limits (except after last one)
      if (campaignIndex < campaignCount - 1) {
        const delayCampaigns = 1000; // 1 second between campaigns
        console.log(`⏳ Waiting ${delayCampaigns}ms before next campaign...`);
        await new Promise(resolve => setTimeout(resolve, delayCampaigns));
      }
    }

      if (trackingUrlToUse) {
        await updateUsageStats(
          supabase,
          offer.id,
          trackingUrlToUse,
          trackingUrlLabel,
          referrerToUse,
          referrerLabel,
          traceSuccessful
        );
      }
    }

    // If no params extracted or trace failed, return what we have so frontend can debug
    if (!traceSuccessful || !finalSuffix) {
      console.warn(`⚠️ No params extracted: traceSuccessful=${traceSuccessful}, finalSuffix=${finalSuffix ? finalSuffix.length + ' chars' : 'empty'}`);
      return new Response(
        JSON.stringify({
          success: false,
          offer_name: offer.offer_name,
          message: 'No params extracted from trace',
          trace_attempted: !!trackingUrlToUse,
          trace_successful: traceSuccessful,
          tracking_url_used: trackingUrlToUse,
          suffix: finalSuffix || null,
          params_extracted: extractedParams,
          attempts: attemptCount,
          last_error: lastTraceError,
          last_status: lastTraceStatus,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const wasTraced = !!trackingUrlToUse && finalSuffix.length > 0;

    console.log('💾 Inserting suffix_request with proxy_ip:', proxyIp);

    await supabase.from('suffix_requests').insert({
      offer_id: offer.id,
      suffix_returned: finalSuffix,
      ip_address: clientIp,
      user_agent: userAgent,
      params: extractedParams,
      proxy_ip: proxyIp,
      tracking_url_used: trackingUrlToUse,
      tracking_url_label: trackingUrlLabel,
      tracking_url_weight: trackingUrlWeight,
      tracking_url_index: trackingUrlIndex,
      referrer_used: referrerToUse,
      referrer_label: referrerLabel,
      referrer_weight: referrerWeight,
      referrer_index: referrerIndex,
      rotation_mode: {
        tracking_url_mode: trackingUrlRotationMode,
        referrer_mode: referrerRotationMode,
      },
      params_extracted: extractedParams,
      params_filtered: filteredParams,
      filter_mode: offer.param_filter_mode || 'all',
    });

    const { data: currentStats } = await supabase
      .from('offer_statistics')
      .select('*')
      .eq('offer_id', offer.id)
      .maybeSingle();

    const newStats = {
      offer_id: offer.id,
      total_suffix_requests: (currentStats?.total_suffix_requests || 0) + 1,
      total_tracking_hits: (currentStats?.total_tracking_hits || 0) + (wasTraced ? 1 : 0),
      last_request_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('offer_statistics')
      .upsert(newStats, { onConflict: 'offer_id' });

    const responsePayload: any = {
      success: true,
      offer_name: offer.offer_name,
      final_url: tracedFinalUrl || offer.final_url,  // Use traced final URL if available
      tracking_url_used: trackingUrlToUse,
      tracking_url_label: trackingUrlLabel,
      tracking_url_weight: trackingUrlWeight,
      tracking_url_index: trackingUrlIndex,
      referrer_used: referrerToUse,
      referrer_label: referrerLabel,
      referrer_weight: referrerWeight,
      referrer_index: referrerIndex,
      rotation_mode: {
        tracking_url_mode: trackingUrlRotationMode,
        referrer_mode: referrerRotationMode,
      },
      suffix: finalSuffix,
      params_extracted: extractedParams,
      params_filtered: filteredParams,
      param_filter_mode: offer.param_filter_mode || 'all',
      trace_successful: traceSuccessful,
      attempts: attemptCount,
      user_agent: usedUserAgent,  // Include user agent that was used
      selected_geo: selectedGeo,  // Include selected geo country
      geo_location: geoLocation,  // Include geo location details
      timestamp: new Date().toISOString(),
    };
    
    // If multiple campaigns requested, include array of all suffixes
    if (campaignCount > 1) {
      responsePayload.campaign_count = campaignCount;
      responsePayload.suffixes = multipleSuffixes;
      responsePayload.suffixes_generated = multipleSuffixes.length;
      console.log(`📦 Returning ${multipleSuffixes.length}/${campaignCount} unique suffixes`);
    }

    // Only include bandwidth info if debug=true (reduces response size and processing)
    if (debug) {
      responsePayload.trace_bandwidth_bytes = traceBandwidth_bytes;
      const response_bandwidth_bytes = JSON.stringify(responsePayload).length;
      responsePayload.bandwidth_bytes = response_bandwidth_bytes;
      console.log(`📊 Debug mode: trace_bandwidth=${traceBandwidth_bytes}B, response_size=${response_bandwidth_bytes}B`);
    }

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
