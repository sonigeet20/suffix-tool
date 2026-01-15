import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] ===== TRACKIER WEBHOOK =====`);
  console.log(`[${requestId}] Method:`, req.method);
  console.log(`[${requestId}] URL:`, req.url);
  console.log(`[${requestId}] Headers:`, Object.fromEntries(req.headers));

  // Handle CORS
  if (req.method === "OPTIONS") {
    console.log(`[${requestId}] CORS preflight`);
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Parse query params
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams);
    console.log(`[${requestId}] Query params:`, queryParams);

    // Parse body (Trackier may send POST webhooks)
    let bodyParams: Record<string, string> = {};
    let rawBody = "";
    if (req.method === "POST" || req.method === "PUT") {
      const contentType = req.headers.get("content-type") || "";
      rawBody = await req.text();
      console.log(`[${requestId}] Raw body (${rawBody.length} bytes):`, rawBody.substring(0, 500));

      if (rawBody) {
        if (contentType.includes("application/json")) {
          try {
            const parsed = JSON.parse(rawBody);
            if (parsed && typeof parsed === "object") {
              bodyParams = parsed;
            }
            console.log(`[${requestId}] Parsed JSON body:`, bodyParams);
          } catch (e) {
            console.warn(`[${requestId}] ⚠️ Could not parse JSON body:`, e instanceof Error ? e.message : "unknown error");
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          bodyParams = Object.fromEntries(new URLSearchParams(rawBody));
          console.log(`[${requestId}] Parsed form body:`, bodyParams);
        }
      }
    }

    // Merge params with body taking precedence
    const mergedParams = { ...queryParams, ...bodyParams } as Record<string, string>;
    console.log(`[${requestId}] Merged params:`, mergedParams);

    // Extract identifiers
    const token = mergedParams.token || null;
    const campaignId = mergedParams.campaign_id || mergedParams.campaignId || "unknown";
    const clickId = mergedParams.click_id || mergedParams.clickid || null;

    console.log(`[${requestId}] Token: ${token}, Campaign ID: ${campaignId}, Click ID: ${clickId}`);

    // Multi-route webhook resolution (backwards compatible)
    let offerId: string | null = null;
    let trackierOffer = null;
    let activePair = null;
    let pairIndex = 1;

    // ROUTE 1: Token matches offer ID (LEGACY single-pair mode)
    if (token) {
      console.log(`[${requestId}] 🔍 Route 1: Checking if token is offer ID...`);
      const { data: offer, error: offerError } = await supabase
        .from("trackier_offers")
        .select("*")
        .eq("id", token)
        .eq("enabled", true)
        .single();
      
      if (offer && !offerError) {
        trackierOffer = offer;
        offerId = offer.id;
        
        // Extract pair 1 from additional_pairs if exists, else use top-level columns
        if (offer.additional_pairs && offer.additional_pairs.length > 0) {
          activePair = offer.additional_pairs[0];
          pairIndex = 1;
          console.log(`[${requestId}] ✅ Route 1 SUCCESS: Legacy offer ${offer.offer_name} (using additional_pairs[0])`);
        } else {
          // Fallback to top-level columns for un-migrated offers
          console.log(`[${requestId}] ✅ Route 1 SUCCESS: Legacy offer ${offer.offer_name} (using top-level columns)`);
        }
      }
    }

    // ROUTE 2: Token matches pair webhook_token (NEW multi-pair mode)
    if (!trackierOffer && token) {
      console.log(`[${requestId}] 🔍 Route 2: Searching for pair webhook_token...`);
      const { data: offers } = await supabase
        .from("trackier_offers")
        .select("*")
        .eq("enabled", true);
      
      // Search for matching webhook_token in additional_pairs arrays
      for (const offer of offers || []) {
        if (offer.additional_pairs && Array.isArray(offer.additional_pairs)) {
          const pair = offer.additional_pairs.find(
            (p: any) => p.webhook_token === token && p.enabled !== false
          );
          if (pair) {
            trackierOffer = offer;
            offerId = offer.id;
            activePair = pair;
            pairIndex = pair.pair_index;
            console.log(`[${requestId}] ✅ Route 2 SUCCESS: Found pair ${pairIndex} for offer ${offer.offer_name}`);
            break;
          }
        }
      }
      
      if (!trackierOffer) {
        console.log(`[${requestId}] ⚠️ Route 2: No pair found with webhook_token: ${token}`);
      }
    }

    // ROUTE 3: Fallback by campaign_id (PRESERVED for backwards compat)
    if (!trackierOffer && campaignId && campaignId !== "unknown") {
      console.log(`[${requestId}] 🔍 Route 3: Fallback search by campaign_id...`);
      const { data: offerByCampaign } = await supabase
        .from("trackier_offers")
        .select("*")
        .or(`url1_campaign_id_real.eq.${campaignId},url2_campaign_id_real.eq.${campaignId}`)
        .eq("enabled", true)
        .limit(1)
        .single();
      
      if (offerByCampaign) {
        trackierOffer = offerByCampaign;
        offerId = offerByCampaign.id;
        
        // Try to find pair by campaign_id in additional_pairs
        if (offerByCampaign.additional_pairs && Array.isArray(offerByCampaign.additional_pairs)) {
          activePair = offerByCampaign.additional_pairs.find(
            (p: any) => p.url1_campaign_id_real === campaignId || p.url2_campaign_id_real === campaignId
          );
          pairIndex = activePair?.pair_index || 1;
        }
        console.log(`[${requestId}] ✅ Route 3 SUCCESS: Found by campaign_id ${campaignId}, pair ${pairIndex}`);
      } else {
        console.warn(`[${requestId}] ⚠️ Route 3: No offer matched campaign_id: ${campaignId}`);
      }
    }

    if (!trackierOffer) {
      console.warn(`[${requestId}] ❌ No offer found via any route (token: ${token}, campaign_id: ${campaignId})`);
    }

    // INSERT log
    const { data: log, error: insertError } = await supabase
      .from("trackier_webhook_logs")
      .insert({
        trackier_offer_id: offerId,
        campaign_id: campaignId,
        click_id: clickId,
        payload: mergedParams,
        pair_index: pairIndex, // NEW: Track which pair this webhook is for
        pair_webhook_token: token, // NEW: Store the webhook token used
        processed: false,
        queued_for_update: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("❌ INSERT FAILED:", insertError.message, insertError);
      return new Response(
        JSON.stringify({ error: "Database insert failed", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] ✅ Logged webhook ID:`, log.id);

    // TRIGGER TRACE AND UPDATE if offer found
    if (trackierOffer && offerId) {
      console.log(`[${requestId}] 🚀 Triggering trace for offer:`, trackierOffer.offer_name);

      try {
        // Call get-suffix to get traced parameters (synchronous for reliability)
        const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(trackierOffer.offer_name)}`;
        console.log(`[${requestId}] 📡 Calling get-suffix:`, getSuffixUrl);
        
        const traceStart = Date.now();
        const traceResponse = await fetch(getSuffixUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!traceResponse.ok) {
          console.error(`[${requestId}] ❌ get-suffix failed:`, traceResponse.status, await traceResponse.text());
          throw new Error(`Trace failed: ${traceResponse.status}`);
        }

        const suffixData = await traceResponse.json();
        const traceDuration = Date.now() - traceStart;
        console.log(`[${requestId}] ✅ Trace complete in ${traceDuration}ms, params:`, Object.keys(suffixData.params_filtered || {}).length);

        // Extract parameters from traced suffix
        const tracedParams = suffixData.params_filtered || suffixData.params_extracted || {};

        // Build subIdOverride payload for Trackier (supports erid, p1-p10, app fields)
        const subIdMapping = (trackierOffer.sub_id_mapping || {}) as Record<string, string>;
        const subIdOverride: Record<string, string> = {};

        const setOverride = (targetKey: string, explicitParam?: string) => {
          const sourceKey = explicitParam || subIdMapping[targetKey] || targetKey;
          const value = tracedParams[sourceKey];
          if (value !== undefined && value !== null && value !== "") {
            subIdOverride[targetKey] = String(value);
          }
        };

        // Map Trackier supported fields
        for (let i = 1; i <= 10; i++) {
          setOverride(`p${i}`);
        }
        ["erid", "app_name", "app_id", "cr_name"].forEach((key) => setOverride(key));

        console.log(`[${requestId}] 📋 subIdOverride payload:`, subIdOverride);

        // Determine target URL 2 campaign ID (pair-specific or legacy)
        let targetCampaignId: string;
        if (activePair && activePair.url2_campaign_id_real) {
          targetCampaignId = activePair.url2_campaign_id_real;
          console.log(`[${requestId}] 🎯 Using pair ${pairIndex} URL2 campaign: ${targetCampaignId}`);
        } else {
          targetCampaignId = trackierOffer.url2_campaign_id_real;
          console.log(`[${requestId}] 🎯 Using legacy URL2 campaign: ${targetCampaignId}`);
        }

        // Update Trackier URL 2 with subIdOverride
        if (Object.keys(subIdOverride).length > 0 && trackierOffer.api_key && targetCampaignId) {
          try {
            const trackierApiUrl = `${trackierOffer.api_base_url || "https://api.trackier.com"}/v2/campaigns/${targetCampaignId}`;
            const updatePayload = { subIdOverride };

            console.log(`[${requestId}] 🔄 Updating Trackier URL 2 campaign ${targetCampaignId} (pair ${pairIndex})`);

            const updateStart = Date.now();
            const trackierResponse = await fetch(trackierApiUrl, {
              method: "POST",
              headers: {
                "X-Api-Key": trackierOffer.api_key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(updatePayload),
            });

            const updateDuration = Date.now() - updateStart;
            const trackierText = await trackierResponse.text();

            if (trackierResponse.ok) {
              console.log(`[${requestId}] ✅ Trackier URL 2 updated (${updateDuration}ms) for pair ${pairIndex}`);

              // Update webhook log
              await supabase
                .from("trackier_webhook_logs")
                .update({
                  processed: true,
                  queued_for_update: true,
                  processed_at: new Date().toISOString(),
                  trace_duration_ms: traceDuration,
                  update_duration_ms: updateDuration,
                })
                .eq("id", log.id);

              // Update database: pair-specific or legacy
              if (activePair && pairIndex > 1) {
                // Update specific pair in additional_pairs array
                console.log(`[${requestId}] 📊 Updating pair ${pairIndex} stats in additional_pairs`);
                const { error: updateError } = await supabase.rpc('update_trackier_pair_stats', {
                  p_offer_id: offerId,
                  p_pair_idx: pairIndex - 1, // Array is 0-indexed
                  p_new_sub_id_values: subIdOverride,
                  p_trace_duration: traceDuration,
                  p_update_duration: updateDuration
                });
                
                if (updateError) {
                  console.error(`[${requestId}] ❌ Failed to update pair stats:`, updateError);
                }
              } else {
                // Update legacy top-level columns (backwards compatible)
                console.log(`[${requestId}] 📊 Updating legacy offer columns`);
                await supabase
                  .from("trackier_offers")
                  .update({
                    url2_last_suffix: suffixData.suffix || "",
                    url2_last_updated_at: new Date().toISOString(),
                    update_count: (trackierOffer.update_count || 0) + 1,
                    last_update_duration_ms: updateDuration,
                    sub_id_values: { ...(trackierOffer.sub_id_values || {}), ...subIdOverride },
                  })
                  .eq("id", offerId);
                
                // Also update pair 1 in additional_pairs if it exists
                if (trackierOffer.additional_pairs && trackierOffer.additional_pairs.length > 0) {
                  await supabase.rpc('update_trackier_pair_stats', {
                    p_offer_id: offerId,
                    p_pair_idx: 0,
                    p_new_sub_id_values: subIdOverride,
                    p_trace_duration: traceDuration,
                    p_update_duration: updateDuration
                  });
                }
              }

            } else {
              console.error(`[${requestId}] ❌ Trackier update failed (${trackierResponse.status}):`, trackierText);
              throw new Error(`Trackier API error: ${trackierResponse.status}`);
            }
          } catch (trackierError) {
            console.error(`[${requestId}] ❌ Trackier update error:`, trackierError instanceof Error ? trackierError.message : String(trackierError));
            throw trackierError;
          }
        } else {
          console.log(`[${requestId}] ⏭️ No params to update or missing Trackier config`);

          // Still mark as processed even if no update needed
          await supabase
            .from("trackier_webhook_logs")
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
              trace_duration_ms: traceDuration,
            })
            .eq("id", log.id);
        }

        console.log(`[${requestId}] 📊 Webhook processed successfully`);
      } catch (error) {
        console.error(`[${requestId}] ❌ Trace failed:`, error instanceof Error ? error.message : String(error));
        
        // Mark as errored
        await supabase
          .from("trackier_webhook_logs")
          .update({
            processed: true,
            error: error instanceof Error ? error.message : String(error),
            processed_at: new Date().toISOString(),
          })
          .eq("id", log.id);
      }
    } else {
      console.log(`[${requestId}] ⏭️ No offer found, skipping trace`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        webhook_id: log.id,
        offer_id: offerId,
        campaign_id: campaignId,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${requestId}] ❌ EXCEPTION:`, error instanceof Error ? error.message : String(error));
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : "");
    return new Response(
      JSON.stringify({ error: "Internal error", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
