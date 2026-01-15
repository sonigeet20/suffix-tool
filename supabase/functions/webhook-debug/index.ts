import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Capture everything about the request
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams);
    
    let bodyText = "";
    let bodyJson: any = null;
    let bodyParams: Record<string, string> = {};

    // Read body if present
    if (req.method === "POST" || req.method === "PUT") {
      bodyText = await req.text();
      
      const contentType = req.headers.get("content-type") || "";
      if (bodyText) {
        if (contentType.includes("application/json")) {
          try {
            bodyJson = JSON.parse(bodyText);
          } catch (e) {
            console.log("Could not parse JSON");
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          bodyParams = Object.fromEntries(new URLSearchParams(bodyText));
        }
      }
    }

    // Log to database for inspection
    const { error } = await supabase
      .from("webhook_debug_logs")
      .insert({
        method: req.method,
        url: req.url,
        path: url.pathname,
        query_params: queryParams,
        body_text: bodyText || null,
        body_json: bodyJson,
        body_params: bodyParams,
        content_type: req.headers.get("content-type"),
        headers: {
          "user-agent": req.headers.get("user-agent"),
          "referer": req.headers.get("referer"),
          "authorization": req.headers.get("authorization") ? "present" : "none",
        },
        timestamp: new Date().toISOString(),
      });

    if (error) {
      console.error("Insert error:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        received: {
          method: req.method,
          path: url.pathname,
          query_params: queryParams,
          body_length: bodyText.length,
          has_body_json: !!bodyJson,
          has_body_params: Object.keys(bodyParams).length > 0,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
