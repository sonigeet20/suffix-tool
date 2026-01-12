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

    console.log(`Token: ${token}, Campaign ID: ${campaignId}, Click ID: ${clickId}`);

    // Look up offer by token; fallback to campaign_id mapping
    let offerId: string | null = null;
    let trackierOffer = null;

    if (token) {
      offerId = token;
      console.log("✅ Using token as offer ID:", offerId);
      const { data: offer, error: offerError } = await supabase
        .from("trackier_offers")
        .select("*")
        .eq("id", offerId)
        .eq("enabled", true)
        .single();
      if (offer && !offerError) {
        trackierOffer = offer;
        console.log("✅ Found offer:", offer.offer_name);
      } else {
        console.warn("⚠️ Offer not found or disabled for token:", offerError?.message);
      }
    } else if (campaignId && campaignId !== "unknown") {
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
        console.log("✅ Found offer by campaign:", offerByCampaign.offer_name);
      } else {
        console.warn("⚠️ No offer matched campaign_id:", campaignId);
      }
    } else {
      console.warn("⚠️ No token or campaign_id provided");
    }

    // INSERT log
    const { data: log, error: insertError } = await supabase
      .from("trackier_webhook_logs")
      .insert({
        trackier_offer_id: offerId,
        campaign_id: campaignId,
        click_id: clickId,
        payload: mergedParams,
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

        // Update Trackier URL 2 with subIdOverride
        if (Object.keys(subIdOverride).length > 0 && trackierOffer.api_key && trackierOffer.url2_campaign_id_real) {
          try {
            const trackierApiUrl = `${trackierOffer.api_base_url || "https://api.trackier.com"}/v2/campaigns/${trackierOffer.url2_campaign_id_real}`;
            const updatePayload = { subIdOverride };

            console.log(`[${requestId}] 🔄 Updating Trackier URL 2 campaign ${trackierOffer.url2_campaign_id_real}`);

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
              console.log(`[${requestId}] ✅ Trackier URL 2 updated (${updateDuration}ms)`);

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

              // Update trackier_offers table
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
