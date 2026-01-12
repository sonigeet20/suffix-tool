import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
};

/**
 * Trackier Create Campaigns Edge Function
 * 
 * Proxies campaign creation requests to the backend load balancer.
 * Avoids mixed content issues (HTTPS frontend to HTTP backend).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Forward to load balancer
    const backendUrl = "http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com:3000/api/trackier-create-campaigns";

    console.log("[Trackier Create Campaigns] Forwarding to backend:", backendUrl);

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Trackier Create Campaigns] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Campaign creation failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
