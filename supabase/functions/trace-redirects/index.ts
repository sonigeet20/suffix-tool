import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RedirectStep {
  url: string;
  status: number;
  redirect_type: "http" | "meta" | "javascript" | "final" | "error";
  method: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  html_snippet?: string;
  error?: string;
  timing_ms?: number;
}

interface TraceRequest {
  url: string;
  max_redirects?: number;
  timeout_ms?: number;
  user_agent?: string;
  user_id?: string;
  use_proxy?: boolean;
  target_country?: string;
  referrer?: string;
  tracer_mode?: string;
  expected_final_url?: string;
  geo_pool?: string[];
  geo_strategy?: string;
  geo_weights?: Record<string, number>;
}

async function fetchThroughResidentialProxy(
  url: string,
  proxyHost: string,
  proxyPort: number,
  proxyUsername: string,
  proxyPassword: string,
  timeout: number,
  customHeaders: Record<string, string>,
): Promise<
  { status: number; headers: Record<string, string>; body: string } | null
> {
  try {
    const proxyUrl =
      `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
    console.log("🔌 Using residential proxy:", proxyHost);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "GET",
      headers: customHeaders,
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const status = response.status;
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const contentType = headers["content-type"] || "";
    let body = "";
    if (contentType.includes("text/html")) {
      body = await response.text();
    }

    return { status, headers, body };
  } catch (error: any) {
    console.error("❌ Residential proxy fetch error:", error.message);
    return null;
  }
}

async function fetchThroughAWSProxy(
  url: string,
  awsProxyUrl: string,
  maxRedirects: number,
  timeout: number,
  userAgent: string,
  targetCountry?: string | null,
  referrer?: string | null,
  tracerMode?: string,
  expectedFinalUrl?: string | null,
  geoPool?: string[] | null,
  geoStrategy?: string | null,
  geoWeights?: Record<string, number> | null,
): Promise<
  | { success: boolean; chain: any[]; proxy_ip?: string; geo_location?: any }
  | null
> {
  try {
    const validModes = ["http_only", "browser", "anti_cloaking", "interactive"];
    const effectiveMode = validModes.includes(tracerMode || "")
      ? tracerMode
      : "http_only";
    console.log(
      "🔄 Calling AWS Proxy Service:",
      awsProxyUrl,
      "Mode:",
      tracerMode,
      "→",
      effectiveMode,
      "Country:",
      targetCountry || "any",
      "Referrer:",
      referrer || "none",
    );
    const requestBody: any = {
      url,
      max_redirects: maxRedirects,
      timeout_ms: timeout,
      target_country: targetCountry || null,
      mode: effectiveMode,
      user_agent: userAgent,
    };

    if (referrer) {
      requestBody.referrer = referrer;
    }

    if (expectedFinalUrl) {
      requestBody.expected_final_url = expectedFinalUrl;
    }

    if (geoPool && geoPool.length > 0) {
      requestBody.geo_pool = geoPool;
    }

    if (geoStrategy) {
      requestBody.geo_strategy = geoStrategy;
    }

    if (geoWeights && Object.keys(geoWeights).length > 0) {
      requestBody.geo_weights = geoWeights;
    }

    const response = await fetch(`${awsProxyUrl}/trace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout + 5000),
    });

    if (!response.ok) {
      console.error(`AWS Proxy Service error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("AWS Proxy Service fetch error:", error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      url,
      max_redirects = 20,
      timeout_ms = 60000,
      user_agent,
      user_id,
      use_proxy = true,
      target_country,
      referrer,
      tracer_mode = "auto",
      expected_final_url = null,
      geo_pool = null,
      geo_strategy = null,
      geo_weights = null,
    } = await req.json() as TraceRequest;

    if (!url) {
      throw new Error("URL is required");
    }

    // Pin a single UA for this trace and reuse everywhere
    const userAgentStr = user_agent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    let validatedUrl: string;
    try {
      const urlObj = new URL(url);
      validatedUrl = urlObj.toString();
      console.log("Validated URL:", validatedUrl);
    } catch (urlError: any) {
      throw new Error(`Invalid URL format: ${urlError.message}`);
    }

    let awsProxyUrl: string | null = null;
    let proxyHost: string | null = null;
    let proxyPort: number | null = null;
    let proxyUsername: string | null = null;
    let proxyPassword: string | null = null;
    let effectiveUserId = user_id;

    if (!effectiveUserId && authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        if (token && token !== "undefined" && token !== "null") {
          const { data: { user }, error: authError } = await supabase.auth
            .getUser(token);
          if (!authError && user) {
            effectiveUserId = user.id;
            console.log("✅ User ID from auth token:", effectiveUserId);
          }
        }
      } catch (err) {
        console.log("⚠️ Could not get user from auth header:", err);
      }
    }

    if (effectiveUserId) {
      try {
        console.log("🔑 Fetching proxy settings for user:", effectiveUserId);
        const { data: settings, error: settingsError } = await supabase
          .from("settings")
          .select("*")
          .eq("user_id", effectiveUserId)
          .maybeSingle();

        if (settingsError) {
          console.error("❌ Settings query error:", settingsError);
        }

        if (!settingsError && settings) {
          if (settings.aws_proxy_url) {
            awsProxyUrl = settings.aws_proxy_url;
            console.log("✅ AWS Proxy Service configured:", awsProxyUrl);
          }

          if (
            settings.luna_proxy_host && settings.luna_proxy_port &&
            settings.luna_proxy_username && settings.luna_proxy_password
          ) {
            proxyHost = settings.luna_proxy_host;
            proxyPort = settings.luna_proxy_port;
            proxyUsername = settings.luna_proxy_username;
            proxyPassword = settings.luna_proxy_password;
            console.log("✅ Residential proxy configured:", proxyHost);
          } else if (!awsProxyUrl) {
            console.log("⚠️ No proxy credentials configured");
          }
        } else {
          console.log("⚠️ No settings found for user");
        }
      } catch (settingsErr) {
        console.error("❌ Failed to fetch settings:", settingsErr);
      }
    } else {
      console.log("⚠️ No user_id provided - proxy will not be used");
    }

    let selectedProvider: any = null;
    let providerId: string | null = null;

    if (effectiveUserId && !awsProxyUrl) {
      try {
        console.log("🔍 Checking for additional proxy providers...");
        const { data: providers, error: providersError } = await supabase
          .rpc("select_next_provider", { p_user_id: effectiveUserId })
          .limit(1);

        if (!providersError && providers && providers.length > 0) {
          selectedProvider = providers[0];
          providerId = selectedProvider.id;
          proxyHost = selectedProvider.host;
          proxyPort = selectedProvider.port;
          proxyUsername = selectedProvider.username;
          proxyPassword = selectedProvider.password;
          console.log(
            "✅ Selected provider:",
            selectedProvider.name,
            "(",
            selectedProvider.provider_type,
            ")",
          );
        } else {
          console.log(
            "ℹ️ No additional providers configured, using Luna from settings",
          );
        }
      } catch (providerErr) {
        console.error("❌ Failed to select provider:", providerErr);
        console.log("ℹ️ Falling back to Luna from settings");
      }
    }

    if (awsProxyUrl) {
      console.log("🚀 Using AWS Proxy Service for tracing");
      const awsResult = await fetchThroughAWSProxy(
        validatedUrl,
        awsProxyUrl,
        max_redirects,
        timeout_ms,
        userAgentStr,
        target_country,
        referrer,
        tracer_mode,
        expected_final_url,
        geo_pool,
        geo_strategy,
        geo_weights,
      );

      if (awsResult) {
        return new Response(
          JSON.stringify({ ...awsResult, user_agent: userAgentStr }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "AWS Proxy Service failed - no alternative tracing available",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "No AWS Proxy Service configured - edge function requires AWS proxy for tracing",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Direct tracing is no longer supported - only AWS Proxy Service
    // All code below is unreachable
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Tracing via this edge function requires AWS Proxy Service configuration",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("Top-level error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to trace redirects",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
