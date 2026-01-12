import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
};

interface TraceRequest {
  final_url: string;
  tracer_mode?: string;
  max_redirects?: number;
  timeout_ms?: number;
  extract_from_location_header?: boolean;
  location_extract_hop?: number | null;
}

interface TraceResponse {
  success: boolean;
  resolved_final_url?: string;
  query_params?: Record<string, string>;
  redirect_chain?: string[];
  duration_ms?: number;
  error?: string;
}

/**
 * Trace HTTP redirects and extract query parameters
 * Used by Trackier setup to detect parameters automatically
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
    const body = await req.json() as TraceRequest;
    const {
      final_url,
      tracer_mode = "http_only",
      max_redirects = 20,
      timeout_ms = 45000,
      extract_from_location_header = false,
      location_extract_hop = null,
    } = body;

    if (!final_url) {
      return new Response(
        JSON.stringify({ success: false, error: "final_url is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[Trackier Trace] Starting trace for:", final_url);
    console.log("[Trackier Trace] Mode:", tracer_mode);

    const result = await traceRedirectsHttpOnly(
      final_url,
      max_redirects,
      timeout_ms,
      extract_from_location_header,
      location_extract_hop
    );

    // Extract query parameters
    const queryParams = extractQueryParams(result);

    const response: TraceResponse = {
      success: true,
      resolved_final_url: result.final_url,
      query_params: queryParams,
      redirect_chain: result.redirect_chain,
      duration_ms: result.duration_ms,
    };

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

/**
 * HTTP-only tracer using fetch
 */
async function traceRedirectsHttpOnly(
  url: string,
  maxRedirects: number,
  timeoutMs: number,
  extractFromLocationHeader: boolean,
  locationExtractHop: number | null
): Promise<{
  final_url: string;
  redirect_chain: string[];
  location_headers: string[];
  duration_ms: number;
}> {
  const startTime = Date.now();
  const redirectChain: string[] = [];
  const locationHeaders: string[] = [];
  let currentUrl = url;
  let finalUrl = url;
  let hopCount = 0;

  for (let i = 0; i < maxRedirects; i++) {
    redirectChain.push(currentUrl);
    hopCount++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(5000, timeoutMs));

      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for Location header (redirect)
      const location = response.headers.get("location");
      if (location && response.status >= 300 && response.status < 400) {
        locationHeaders.push(location);

        // If we should extract from this hop
        if (
          extractFromLocationHeader &&
          (locationExtractHop === null || locationExtractHop === hopCount)
        ) {
          finalUrl = location;
        }

        // Follow redirect
        try {
          currentUrl = new URL(location, currentUrl).href;
        } catch (e) {
          currentUrl = location;
        }
        continue;
      }

      // No redirect, we're done
      finalUrl = currentUrl;
      break;
    } catch (error) {
      console.log(
        "[Trackier Trace] Fetch error at hop",
        hopCount,
        ":",
        error instanceof Error ? error.message : "Unknown error"
      );
      finalUrl = currentUrl;
      break;
    }
  }

  return {
    final_url: finalUrl,
    redirect_chain: redirectChain,
    location_headers: locationHeaders,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Extract query parameters from a URL
 */
function extractQueryParams(traceResult: {
  final_url: string;
  location_headers: string[];
}): Record<string, string> {
  const params: Record<string, string> = {};

  try {
    // Extract from final URL
    if (traceResult.final_url) {
      const url = new URL(traceResult.final_url);
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    // Extract from location headers if available
    if (traceResult.location_headers && Array.isArray(traceResult.location_headers)) {
      traceResult.location_headers.forEach((header) => {
        if (header && typeof header === "string" && header.includes("?")) {
          try {
            const url = new URL(header);
            url.searchParams.forEach((value, key) => {
              if (!params[key]) {
                // Don't override params from final URL
                params[key] = value;
              }
            });
          } catch (e) {
            console.log("[Trackier Trace] Could not parse location header:", header);
          }
        }
      });
    }
  } catch (error) {
    console.error(
      "[Trackier Trace] Error extracting params:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  return params;
}
