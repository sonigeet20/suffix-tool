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
  const enabledItems = items.filter(item => item.enabled);

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

    if (offerError || !offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found or inactive' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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

    let finalSuffix = offer.suffix_pattern || '';
    let extractedParams: Record<string, string> = {};
    let filteredParams: Record<string, string> = {};
    let traceSuccessful = false;
    let attemptCount = 0;
    let proxyIp: string | null = null;

    if (trackingUrlToUse) {
      const retryLimit = offer.retry_limit || 3;
      const retryDelay = offer.retry_delay_ms || 2000;

      for (let attempt = 0; attempt <= retryLimit; attempt++) {
        attemptCount = attempt + 1;

        if (attempt > 0) {
          console.log(`Retry attempt ${attempt}/${retryLimit} after ${retryDelay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        try {
          const traceRequestBody: any = {
            url: trackingUrlToUse,
            max_redirects: 20,
            timeout_ms: 45000,
            user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            user_id: offer.user_id,
            use_proxy: true,
            target_country: offer.target_country || null,
            tracer_mode: offer.tracer_mode || 'auto',
          };

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
            console.log('📦 Trace result:', JSON.stringify({
              success: traceResult.success,
              chain_length: traceResult.chain?.length,
              proxy_used: traceResult.proxy_used,
              proxy_ip: traceResult.proxy_ip,
              geo_location: traceResult.geo_location,
            }));

            if (traceResult.success && traceResult.chain && traceResult.chain.length > 0) {
              const chain = traceResult.chain;
              const stepIndex = offer.redirect_chain_step || 0;

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
                  extractedParams = paramsToUse;

                  const paramFilterMode = offer.param_filter_mode || 'all';
                  const paramFilter = offer.param_filter || [];
                  filteredParams = filterParams(extractedParams, paramFilterMode, paramFilter);

                  const params = new URLSearchParams(filteredParams);
                  finalSuffix = params.toString();
                  traceSuccessful = true;
                  const status = selectedStep.error ? 'error' : `status ${selectedStep.status}`;
                  console.log(`Extracted ${Object.keys(extractedParams).length} params, filtered to ${Object.keys(filteredParams).length} params from step ${stepIndex + 1}/${chain.length} (${status})`);
                } else {
                  console.log(`Step ${stepIndex + 1} has no extractable params, using default suffix pattern`);
                }
              } else {
                console.error(`Configured step ${stepIndex + 1} exceeds chain length ${chain.length}`);
              }

              if (traceResult.proxy_ip) {
                proxyIp = traceResult.proxy_ip;
                console.log('✅ Proxy IP captured:', proxyIp);
              } else {
                console.log('⚠️ No proxy_ip in trace result');
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

              await supabase.from('offers').update({
                last_traced_chain: chain,
                last_trace_date: new Date().toISOString(),
              }).eq('id', offer.id);

              break;
            } else {
              console.error(`Trace attempt ${attemptCount} returned empty chain`);
            }
          } else {
            const errorText = await traceResponse.text();
            console.error(`Trace attempt ${attemptCount} failed with status ${traceResponse.status}:`, errorText);
          }

          if (attempt === retryLimit) {
            console.error('All retry attempts exhausted, no params extracted');
          }
        } catch (traceError: any) {
          console.error(`Trace attempt ${attemptCount} failed:`, traceError.message);

          if (attempt === retryLimit) {
            console.error('All retry attempts exhausted, no params extracted');
          }
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

    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const wasTraced = !!trackingUrlToUse && finalSuffix !== (offer.suffix_pattern || '');

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

    return new Response(
      JSON.stringify({
        success: true,
        offer_name: offer.offer_name,
        final_url: offer.final_url,
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
        timestamp: new Date().toISOString(),
      }),
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
