import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
};

/**
 * Trackier Trace Endpoint
 * 
 * This endpoint provides parameter extraction for Trackier offers.
 * It delegates to the get-suffix function to ensure all offer settings are applied:
 * - Proxy configuration
 * - Geo-targeting
 * - Tracer mode settings
 * - Device distribution
 * - Referrer handling
 * - Parameter filtering
 * 
 * This ensures consistency across the entire platform.
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json() as {
      offer_name?: string;
      final_url?: string;
      [key: string]: unknown;
    };

    // For backward compatibility: accept final_url but extract offer_name
    // In Trackier context, offer_name should be provided
    const offerName = body.offer_name;
    
    if (!offerName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "offer_name is required for Trackier trace" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[Trackier Trace] Starting trace for offer:", offerName);

    // Delegate to get-suffix which handles all offer settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offerName)}`;
    
    console.log("[Trackier Trace] Calling get-suffix:", getSuffixUrl);

    const getSuffixResponse = await fetch(getSuffixUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getSuffixResponse.ok) {
      const errorText = await getSuffixResponse.text();
      console.error("[Trackier Trace] get-suffix failed:", errorText);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to trace: ${getSuffixResponse.status}`,
          details: errorText,
        }),
        {
          status: getSuffixResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const getSuffixResult = await getSuffixResponse.json();

    // Transform get-suffix response to trackier-trace format
    const response = {
      success: getSuffixResult.success !== false,
      resolved_final_url: getSuffixResult.final_url || getSuffixResult.resolved_final_url,
      query_params: getSuffixResult.params_filtered || getSuffixResult.params_extracted || {},
      params_extracted: getSuffixResult.params_extracted || {},
      params_filtered: getSuffixResult.params_filtered || {},
      redirect_chain: getSuffixResult.chain?.map((step: any) => step.url) || [],
      proxy_ip: getSuffixResult.proxy_ip,
      user_agent: getSuffixResult.user_agent,
      geo_location: getSuffixResult.geo_location,
      selected_geo: getSuffixResult.selected_geo,
      duration_ms: getSuffixResult.duration_ms,
      offer_name: getSuffixResult.offer_name,
      // Include the full suffix for reference
      suffix: getSuffixResult.suffix,
    };

    console.log("[Trackier Trace] ✅ Trace successful - params extracted:", Object.keys(response.query_params || {}).length);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Trackier Trace] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
