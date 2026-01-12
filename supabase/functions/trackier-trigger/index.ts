import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
};

/**
 * Trackier Trigger Edge Function
 * 
 * Proxies webhook trigger requests to the backend load balancer.
 * Avoids mixed content issues (HTTPS frontend to HTTP backend).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const trackierId = url.pathname.split("/").pop();

    const body = await req.json();

    // Forward to load balancer (port 80)
    const backendUrl = `http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-trigger/${trackierId}`;

    console.log("[Trackier Trigger] Forwarding to backend:", backendUrl);

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
    console.error("[Trackier Trigger] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Trigger failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
