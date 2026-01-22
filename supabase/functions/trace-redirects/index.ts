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
  suffix_step?: number;
  geo_pool?: string[];
  geo_strategy?: string;
  geo_weights?: Record<string, number>;
  offer_id?: string;
  device_distribution?: Array<{ deviceCategory: string; weight: number }>;
  proxy_protocol?: string;
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
  referrerHops?: number[] | null,
  tracerMode?: string,
  expectedFinalUrl?: string | null,
  suffixStep?: number | null,
  geoPool?: string[] | null,
  geoStrategy?: string | null,
  geoWeights?: Record<string, number> | null,
  deviceDistribution?: Array<{ deviceCategory: string; weight: number }> | null,
  extractFromLocationHeader?: boolean | null,
  locationExtractHop?: number | null,
  proxyProtocol?: string | null,
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
      if (referrerHops && referrerHops.length > 0) {
        requestBody.referrer_hops = referrerHops;
        console.log(`🔗 Passing referrer_hops to instance: ${referrerHops.join(',')}`);
      }
    }

    // Location header extraction config (optional)
    if (extractFromLocationHeader) {
      requestBody.extract_from_location_header = true;
      if (locationExtractHop) {
        requestBody.location_extract_hop = locationExtractHop;
        console.log(`📍 Passing location extraction hop: ${locationExtractHop}`);
      } else {
        console.log(`📍 Passing location extraction: last redirect`);
      }
    }

    if (expectedFinalUrl) {
      requestBody.expected_final_url = expectedFinalUrl;
    }

    if (suffixStep !== null && suffixStep !== undefined) {
      requestBody.suffix_step = suffixStep;
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

    if (deviceDistribution && deviceDistribution.length > 0) {
      requestBody.device_distribution = deviceDistribution;
    }

    if (proxyProtocol) {
      requestBody.proxy_protocol = proxyProtocol;
      console.log(`🔐 Proxy protocol: ${proxyProtocol}`);
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

function parseJsRedirectFromHtml(html: string): string | null {
  try {
    // Extract <script> tags and search for redirect patterns
    const scriptMatch = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
    if (!scriptMatch) return null;

    for (const scriptTag of scriptMatch) {
      const scriptContent = scriptTag.replace(/<\/?script[^>]*>/gi, "");

      // Pattern 1: location.href = "url"
      const hrefMatch = scriptContent.match(/location\s*\.\s*href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) return hrefMatch[1].trim();

      // Pattern 2: window.location = "url"
      const windowMatch = scriptContent.match(/window\s*\.\s*location\s*=\s*["']([^"']+)["']/i);
      if (windowMatch && windowMatch[1]) return windowMatch[1].trim();

      // Pattern 3: window.location.href = "url"
      const windowHrefMatch = scriptContent.match(/window\s*\.\s*location\s*\.\s*href\s*=\s*["']([^"']+)["']/i);
      if (windowHrefMatch && windowHrefMatch[1]) return windowHrefMatch[1].trim();

      // Pattern 4: Check for parameter-based redirects like deeplink, url, d, etc
      const paramRedirectMatch = scriptContent.match(/(?:let|const|var)\s+(\w+)\s*=\s*(?:params\.searchParams\.get|urlParams\.get|getParam|.*?searchParams\.get)\s*\(\s*["']([^"']+)["']\s*\)/i);
      if (paramRedirectMatch) {
        const paramKey = paramRedirectMatch[2];
        // Check if this parameter is later used in a redirect
        const paramUsageMatch = scriptContent.match(new RegExp(`location\\s*\\.\\s*(?:href|replace)|window\\s*\\.\\s*location.*?${paramRedirectMatch[1]}`, 'i'));
        if (paramUsageMatch || scriptContent.includes(paramRedirectMatch[1])) {
          // This indicates the JS is redirecting based on a URL parameter
          return `{param_redirect:${paramKey}}`;
        }
      }

      // Pattern 5: Simple deeplink extraction - look for deeplink = searchParams.get("deeplink")
      if (scriptContent.includes('deeplink') && scriptContent.match(/searchParams\.get\s*\(\s*["']deeplink["']\s*\)/i)) {
        return `{param_redirect:deeplink}`;
      }

      // Pattern 6: Check for other common redirect params used in JS
      const commonParams = ['deeplink', 'url', 'target', 'd', 'redirect', 'redir', 'dest', 'return', 'r'];
      for (const param of commonParams) {
        if (scriptContent.includes(`"${param}"`) || scriptContent.includes(`'${param}'`)) {
          if (scriptContent.match(new RegExp(`searchParams\\.get\\s*\\(\\s*[\"']${param}[\"']\\s*\\)`, 'i'))) {
            return `{param_redirect:${param}}`;
          }
        }
      }
    }

    // Pattern: meta refresh
    const metaMatch = html.match(/<meta\s+http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (metaMatch && metaMatch[1]) {
      const content = metaMatch[1];
      const urlPart = content.split(";").find(p => p.toLowerCase().includes("url="));
      if (urlPart) {
        const url = urlPart.split("=")[1];
        return url?.trim() || null;
      }
    }

    return null;
  } catch (error: any) {
    console.error("Error parsing JS redirect:", error.message);
    return null;
  }
}

async function fetchThroughBrightDataBrowser(
  url: string,
  apiKey: string,
  targetCountry?: string | null,
  referrer?: string | null,
  userAgent?: string,
  timeout?: number,
  maxRedirects?: number,
  userContext?: any,
): Promise<
  | {
    success: boolean;
    chain?: any[];
    proxy_ip?: string;
    geo_location?: any;
    error_status?: number;
    error_text?: string;
    error?: string;
  }
> {
  try {
    const chain = [];
    const visitedUrls = new Set<string>();
    let currentUrl = url;
    let hopCount = 0;
    let totalBandwidth = 0;  // Track total bandwidth in bytes
    const maxHops = maxRedirects || 10;

    while (hopCount < maxHops) {
      hopCount++;

      // Check for loops
      if (visitedUrls.has(currentUrl)) {
        console.log(`⚠️ Loop detected at hop ${hopCount}, stopping redirect chain`);
        break;
      }
      visitedUrls.add(currentUrl);

      console.log(`🌐 Bright Data Browser hop ${hopCount}: ${currentUrl}`);

      const requestBody: any = {
        zone: "scraping_browser1",
        url: currentUrl,
        format: "raw",
      };

      if (targetCountry) {
        requestBody.country = targetCountry;
      }

      // CRITICAL: Add user_context to fix "user context" error
      if (userContext && userContext.user_id) {
        requestBody.user_context = {
          user_id: userContext.user_id,
          account_id: userContext.account_id || userContext.user_id,
          session_id: userContext.session_id || `session-${Date.now()}`,
          provider_id: userContext.provider_id,
        };
        console.log(`🔐 Bright Data user context set: ${userContext.user_id}`);
      }

      if (referrer || userAgent) {
        requestBody.headers = {} as Record<string, string>;
        if (referrer) requestBody.headers["Referer"] = referrer;
        if (userAgent) requestBody.headers["User-Agent"] = userAgent;
      }

      try {
        const response = await fetch("https://api.brightdata.com/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeout || 90000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const redirectedTo = response.headers.get("x-unblocker-redirected-to");
          
          // Even on error, check if we have a redirect header
          if (redirectedTo) {
            console.log(`✅ Found x-unblocker-redirected-to header despite error at hop ${hopCount}`);
            chain.push({
              url: currentUrl,
              status: response.status,
              redirect_type: "javascript",
              method: "GET",
              error: `API returned ${response.status} but has redirect header`,
              timing_ms: 0,
            });
            currentUrl = redirectedTo;
            continue;
          }

          console.error(
            `Bright Data Browser API error at hop ${hopCount}: ${response.status}`,
          );
          chain.push({
            url: currentUrl,
            status: response.status,
            redirect_type: "error",
            method: "GET",
            error: `API returned ${response.status}`,
            timing_ms: 0,
          });
          break;
        }

        const htmlContent = await response.text();
        const htmlSizeBytes = new TextEncoder().encode(htmlContent).length;
        totalBandwidth += htmlSizeBytes;  // Track bandwidth
        console.log(`✅ Hop ${hopCount} received HTML, length: ${htmlContent.length} (${htmlSizeBytes.toLocaleString()} B), total bandwidth: ${totalBandwidth.toLocaleString()} B`);

        // Extract query parameters from current URL
        let urlParams: Record<string, string> = {};
        try {
          const urlObj = new URL(currentUrl);
          urlObj.searchParams.forEach((value, key) => {
            urlParams[key] = value;
          });
        } catch (e) {
          // URL parsing failed, continue without params
          console.log(`⚠️ Could not parse URL parameters from hop ${hopCount}`);
        }

        // Add response to chain with minimal HTML snippet for debugging only
        chain.push({
          url: currentUrl,
          status: 200,
          redirect_type: hopCount === 1 ? "javascript" : "javascript",
          method: "GET",
          html_snippet: htmlContent.substring(0, 100),  // Reduced from 500 to minimize bandwidth
          params: Object.keys(urlParams).length > 0 ? urlParams : undefined,
          timing_ms: 0,
        });

        // Check for Bright Data redirect headers first (highest priority)
        const redirectedTo = response.headers.get("x-unblocker-redirected-to");
        if (redirectedTo) {
          console.log(`✅ Found x-unblocker-redirected-to header at hop ${hopCount}`);
          currentUrl = redirectedTo;
          continue;
        }

        // Check for JS redirect in HTML
        const nextUrl = parseJsRedirectFromHtml(htmlContent);

        if (!nextUrl) {
          console.log(`✅ No redirect found in hop ${hopCount}, stopping chain`);
          break;
        }

        // Check if redirect depends on URL parameters
        if (nextUrl.startsWith("{param_redirect:")) {
          const paramMatch = nextUrl.match(/\{param_redirect:(\w+)\}/);
          const paramKey = paramMatch ? paramMatch[1] : null;
          if (paramKey) {
            console.log(`ℹ️ Detected parameter-based redirect on param: ${paramKey}`);
            try {
              const urlObj = new URL(currentUrl);
              const paramValue = urlObj.searchParams.get(paramKey);
              if (paramValue) {
                // Try to decode the parameter value as it might be URL-encoded
                try {
                  currentUrl = decodeURIComponent(paramValue);
                  if (!currentUrl.startsWith('http')) {
                    console.log(`⚠️ Param value is not a URL: ${paramValue}`);
                    break;
                  }
                  console.log(`✅ Extracted redirect URL from param '${paramKey}': ${currentUrl.substring(0, 100)}...`);
                  continue;
                } catch {
                  currentUrl = paramValue;
                  if (currentUrl.startsWith('http')) {
                    console.log(`✅ Extracted redirect URL from param '${paramKey}': ${currentUrl.substring(0, 100)}...`);
                    continue;
                  }
                }
              } else {
                console.log(`⚠️ Parameter '${paramKey}' not found in URL`);
                break;
              }
            } catch (paramErr) {
              console.error(`Error extracting parameter redirect: ${paramErr}`);
              break;
            }
          }
          break;
        }

        currentUrl = nextUrl;
      } catch (hopError: any) {
        console.error(`Error at hop ${hopCount}: ${hopError.message}`);
        chain.push({
          url: currentUrl,
          status: 0,
          redirect_type: "error",
          method: "GET",
          error: hopError.message,
          timing_ms: 0,
        });
        break;
      }
    }

    if (hopCount >= maxHops) {
      console.log(`⚠️ Reached max hops (${maxHops}), stopping redirect chain`);
    }

    // Return total bandwidth in bytes
    return {
      success: chain.length > 0,
      chain: chain.length > 0 ? chain : undefined,
      proxy_ip: undefined,
      geo_location: { country: targetCountry || "unknown" },
      bandwidth_bytes: totalBandwidth,
    };
  } catch (error: any) {
    console.error("Bright Data Browser API fetch error:", error);
    return {
      success: false,
      error: error.message || "Unknown Bright Data Browser error",
      bandwidth_bytes: 0,
    };
  }
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  
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
      referrer_hops,
      tracer_mode = "auto",
      expected_final_url = null,
      suffix_step = null,
      geo_pool = null,
      geo_strategy = null,
      geo_weights = null,
      offer_id = null,
      device_distribution = null,
      interval_used_ms = null,
      account_id = null,
      extract_from_location_header = null,
      location_extract_hop = null,
      proxy_protocol = null,
    } = await req.json() as TraceRequest;

    if (!url) {
      throw new Error("URL is required");
    }

    // Let proxy service handle user agent rotation - don't provide a default
    const userAgentStr = user_agent || null;

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

    // NO JWT VERIFICATION - PUBLIC ENDPOINT
    console.log("📡 Public endpoint access - no JWT required");
    console.log("User ID:", effectiveUserId);

    // PUBLIC ACCESS: Try to fetch settings from database
    // First try with user_id if provided, otherwise get any settings record
    try {
      let settings = null;
      let settingsError = null;

      if (effectiveUserId) {
        console.log("🔑 Fetching proxy settings for user:", effectiveUserId);
        const result = await supabase
          .from("settings")
          .select("*")
          .eq("user_id", effectiveUserId)
          .maybeSingle();
        settings = result.data;
        settingsError = result.error;
      } else {
        console.log("🌐 No user_id provided - fetching any available settings for public access");
        const result = await supabase
          .from("settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        settings = result.data;
        settingsError = result.error;
      }

      if (settingsError) {
        console.error("❌ Settings query error:", settingsError);
      }

      if (settings) {
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
        }
      } else {
        console.log("⚠️ No settings found in database");
      }
    } catch (settingsErr) {
      console.error("❌ Failed to fetch settings:", settingsErr);
    }

    // Use default AWS proxy URL if not configured in database
    if (!awsProxyUrl) {
      const defaultAwsUrl = Deno.env.get("DEFAULT_AWS_PROXY_URL");
      if (defaultAwsUrl) {
        awsProxyUrl = defaultAwsUrl;
        console.log("ℹ️ Using default AWS Proxy Service URL:", awsProxyUrl);
      }
    }

    let selectedProvider: any = null;
    let providerId: string | null = null;
    let useRotation = false;
    let proxyProtocol: string | null = proxy_protocol; // Use request parameter first

    // Check for provider override from offer configuration
    if (effectiveUserId && offer_id) {
      try {
        console.log("🔍 Checking for provider override from offer:", offer_id);
        const { data: offerData, error: offerError } = await supabase
          .from("offers")
          .select("provider_id, proxy_protocol")
          .eq("id", offer_id)
          .eq("user_id", effectiveUserId)
          .maybeSingle();

        if (!offerError && offerData && offerData.provider_id) {
          console.log("✅ Found provider override:", offerData.provider_id);
          
          // Capture proxy_protocol from offer if not provided in request
          if (!proxyProtocol && offerData.proxy_protocol) {
            proxyProtocol = offerData.proxy_protocol;
            console.log("🔐 Offer proxy protocol:", proxyProtocol);
          } else if (proxyProtocol) {
            console.log("🔐 Using request proxy protocol:", proxyProtocol);
          }
          
          // Check for sentinel value for explicit rotation
          if (offerData.provider_id === "USE_ROTATION") {
            useRotation = true;
            console.log("🔄 Using provider rotation (explicit opt-in)");
          } else if (offerData.provider_id === "USE_SETTINGS_LUNA") {
            // Legacy support for USE_SETTINGS_LUNA
            console.log("🔧 Using Luna from settings (legacy value)");
            // proxyHost, proxyPort, proxyUsername, proxyPassword already loaded from settings above
          } else {
            // Fetch the specific provider from proxy_providers table
            const { data: providerData, error: providerError } = await supabase
              .from("proxy_providers")
              .select("*")
              .eq("id", offerData.provider_id)
              .eq("user_id", effectiveUserId)
              .eq("enabled", true)
              .maybeSingle();

            if (!providerError && providerData) {
              selectedProvider = providerData;
              providerId = providerData.id;
              console.log(
                "✅ Using offer provider override:",
                providerData.name,
                "(",
                providerData.provider_type,
                ")",
              );

              // Check if this is a Bright Data Browser API provider
              if (providerData.provider_type === "brightdata_browser") {
                if (!providerData.api_key) {
                  console.error("❌ Bright Data Browser provider missing API key");
                } else {
                  console.log("🌐 Routing to Bright Data Browser API");
                  const brightDataResult = await fetchThroughBrightDataBrowser(
                    validatedUrl,
                    providerData.api_key,
                    target_country,
                    referrer,
                    userAgentStr,
                    timeout_ms,
                    max_redirects,
                    {
                      // CRITICAL: Pass user context to fix "user context" error
                      user_id: effectiveUserId,
                      account_id: effectiveUserId,
                      session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      provider_id: providerData.id,
                    },
                  );

                  if (brightDataResult && brightDataResult.success) {
                    const totalTiming = Date.now() - startTime;
                    const responseBody = { 
                      ...brightDataResult,
                      // Keep user_agent from result if available, otherwise use provided one
                      user_agent: brightDataResult.user_agent || userAgentStr,
                      total_timing_ms: totalTiming,
                      total_steps: brightDataResult.chain?.length || 0,
                    };
                    const responseSizeKb = Math.round(JSON.stringify(responseBody).length / 1024);
                    return new Response(
                      JSON.stringify({ 
                        ...responseBody,
                        bandwidth_kb: responseSizeKb,
                      }),
                      {
                        headers: {
                          ...corsHeaders,
                          "Content-Type": "application/json",
                        },
                      },
                    );
                  } else {
                    console.error("❌ Bright Data Browser API failed");
                    const errorPayload: Record<string, unknown> = {
                      success: false,
                      error: "Bright Data Browser API request failed",
                    };

                    if (brightDataResult?.error_status) {
                      errorPayload.error_status = brightDataResult.error_status;
                    }
                    if (brightDataResult?.error_text) {
                      errorPayload.error_text = brightDataResult.error_text;
                    }
                    if (brightDataResult?.error) {
                      errorPayload.error_detail = brightDataResult.error;
                    }

                    const totalTiming = Date.now() - startTime;
                    return new Response(
                      JSON.stringify({
                        ...errorPayload,
                        total_timing_ms: totalTiming,
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
                }
              } else {
                // Regular proxy provider
                proxyHost = providerData.host;
                proxyPort = providerData.port;
                proxyUsername = providerData.username;
                proxyPassword = providerData.password;
              }
            }
          }
        } else {
          // No provider_id specified - default to Luna from settings
          console.log("ℹ️ No provider override - using Luna from settings (default)");
        }
      } catch (offerErr) {
        console.error("❌ Failed to check offer provider override:", offerErr);
      }
    } else {
      // No offer_id provided - default to Luna from settings
      console.log("ℹ️ No offer_id - using Luna from settings (default)");
    }

    // Only use provider rotation if explicitly requested via USE_ROTATION
    if (effectiveUserId && !awsProxyUrl && !selectedProvider && useRotation) {
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

    // Handle Bright Data Browser provider if already selected (offer override or rotation)
    if (selectedProvider && selectedProvider.provider_type === "brightdata_browser") {
      if (!selectedProvider.api_key) {
        console.error("❌ Bright Data Browser provider missing API key");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Bright Data Browser provider missing API key",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log("🌐 Routing to Bright Data Browser API (selected provider)");
      const brightDataResult = await fetchThroughBrightDataBrowser(
        validatedUrl,
        selectedProvider.api_key,
        target_country,
        referrer,
        userAgentStr,
        timeout_ms,
        max_redirects,
        {
          // CRITICAL: Pass user context to fix "user context" error
          user_id: effectiveUserId,
          account_id: effectiveUserId,
          session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          provider_id: selectedProvider.id,
        },
      );

      if (brightDataResult && brightDataResult.success) {
        const totalTiming = Date.now() - startTime;
        return new Response(
          JSON.stringify({ 
            ...brightDataResult, 
            user_agent: userAgentStr,
            total_timing_ms: totalTiming,
            total_steps: brightDataResult.chain?.length || 0,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      console.error("❌ Bright Data Browser API failed");
      const errorPayload: Record<string, unknown> = {
        success: false,
        error: "Bright Data Browser API request failed",
      };

      if (brightDataResult?.error_status) {
        errorPayload.error_status = brightDataResult.error_status;
      }
      if (brightDataResult?.error_text) {
        errorPayload.error_text = brightDataResult.error_text;
      }
      if (brightDataResult?.error) {
        errorPayload.error_detail = brightDataResult.error;
      }

      return new Response(JSON.stringify(errorPayload), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If tracer_mode explicitly requests Bright Data Browser, try to find a provider and short-circuit AWS
    if (tracer_mode === "brightdata_browser") {
      if (!effectiveUserId) {
        console.log("⚠️ Bright Data Browser mode without user_id - falling back to AWS proxy");
        // Fall back to AWS proxy service which will handle provider selection
        // Don't return error - let it continue to AWS proxy flow below
      } else {

      try {
        console.log("🔍 Looking up Bright Data Browser provider for user");
        const { data: bdProvider, error: bdError } = await supabase
          .from("proxy_providers")
          .select("*")
          .eq("user_id", effectiveUserId)
          .eq("provider_type", "brightdata_browser")
          .eq("enabled", true)
          .limit(1)
          .maybeSingle();

        if (bdError || !bdProvider) {
          console.error("❌ No Bright Data Browser provider found", bdError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "No Bright Data Browser provider configured",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (!bdProvider.api_key) {
          console.error("❌ Bright Data Browser provider missing API key");
          return new Response(
            JSON.stringify({
              success: false,
              error: "Bright Data Browser provider missing API key",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        console.log("🌐 Routing to Bright Data Browser API (forced mode)");
        const brightDataResult = await fetchThroughBrightDataBrowser(
          validatedUrl,
          bdProvider.api_key,
          target_country,
          referrer,
          userAgentStr,
          timeout_ms,
          max_redirects,
          {
            // CRITICAL: Pass user context to fix "user context" error
            user_id: effectiveUserId,
            account_id: effectiveUserId,
            session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            provider_id: bdProvider.id,
          },
        );

        if (brightDataResult && brightDataResult.success) {
          const totalTiming = Date.now() - startTime;
          const responseBody = { 
            ...brightDataResult, 
            user_agent: userAgentStr,
            total_timing_ms: totalTiming,
            total_steps: brightDataResult.chain?.length || 0,
          };
          const responseSizeKb = Math.round(JSON.stringify(responseBody).length / 1024);
          return new Response(
            JSON.stringify({ 
              ...responseBody,
              bandwidth_kb: responseSizeKb,
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        console.error("❌ Bright Data Browser API failed");
        const errorPayload: Record<string, unknown> = {
          success: false,
          error: "Bright Data Browser API request failed",
        };

        if (brightDataResult?.error_status) {
          errorPayload.error_status = brightDataResult.error_status;
        }
        if (brightDataResult?.error_text) {
          errorPayload.error_text = brightDataResult.error_text;
        }
        if (brightDataResult?.error) {
          errorPayload.error_detail = brightDataResult.error;
        }

        return new Response(JSON.stringify(errorPayload), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (bdErr) {
        console.error("❌ Failed to execute Bright Data Browser tracer:", bdErr);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Bright Data Browser tracer execution failed",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      } // Close else block for effectiveUserId check
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
        referrer_hops,
        tracer_mode,
        expected_final_url,
        suffix_step,
        geo_pool,
        geo_strategy,
        geo_weights,
        device_distribution,
        extract_from_location_header,
        location_extract_hop,
        proxyProtocol,
      );

      if (awsResult) {
        // Note: No longer incrementing trace counts - using Google Ads landing page data directly
        
        return new Response(
          JSON.stringify({ 
            ...awsResult,
            // Keep user_agent from awsResult (proxy-generated), only override if explicitly provided
            user_agent: awsResult.user_agent || userAgentStr,
            // Map total_bandwidth_bytes to bandwidth_bytes for consistency
            bandwidth_bytes: awsResult.total_bandwidth_bytes || 0,
          }),
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
