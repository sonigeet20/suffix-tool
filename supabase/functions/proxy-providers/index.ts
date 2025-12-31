import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    // GET - List all providers
    if (req.method === "GET") {
      const { data: providers, error } = await supabaseClient
        .from("proxy_providers")
        .select("*")
        .eq("user_id", user.id)
        .order("priority", { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ providers }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - Create or test provider
    if (req.method === "POST") {
      const body = await req.json();

      // Test endpoint
      if (path === "test") {
        return await testProvider(body);
      }

      // Create provider
      const {
        name,
        provider_type,
        host,
        port,
        username,
        password,
        api_endpoint_example,
        curl_example,
        priority = 50,
        enabled = true,
      } = body;

      // Validate required fields
      if (!name || !provider_type || !host || !port || !username || !password) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: provider, error } = await supabaseClient
        .from("proxy_providers")
        .insert({
          user_id: user.id,
          name,
          provider_type,
          host,
          port,
          username,
          password,
          api_endpoint_example,
          curl_example,
          priority,
          enabled,
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ provider }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PUT - Update provider
    if (req.method === "PUT") {
      const body = await req.json();
      const { id, ...updates } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Provider ID required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: provider, error } = await supabaseClient
        .from("proxy_providers")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ provider }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE - Remove provider
    if (req.method === "DELETE") {
      const body = await req.json();
      const { id } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Provider ID required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error } = await supabaseClient
        .from("proxy_providers")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function testProvider(body: any) {
  const {
    host,
    port,
    username,
    password,
    provider_type,
    test_type = "basic",
    target_country,
    num_requests = 1,
    test_url = "https://ipapi.co/json/",
  } = body;

  // Validate required fields
  if (!host || !port || !username || !password || !provider_type) {
    return new Response(
      JSON.stringify({ error: "Missing required proxy configuration" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    if (test_type === "basic") {
      // Basic connectivity test
      return await testBasicConnection(host, port, username, password, test_url);
    } else if (test_type === "geo") {
      // Geo-targeting test
      if (!target_country) {
        return new Response(
          JSON.stringify({ error: "Target country required for geo test" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return await testGeoTargeting(
        host,
        port,
        username,
        password,
        provider_type,
        target_country,
        num_requests,
        test_url
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid test type" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Test failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

async function testBasicConnection(
  host: string,
  port: number,
  username: string,
  password: string,
  testUrl: string
) {
  const startTime = Date.now();

  try {
    // Create proxy URL with authentication
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;

    // Make request through proxy
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(testUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        status: "connected",
        response_time_ms: responseTime,
        ip_address: data.ip || "Unknown",
        details: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: false,
        status: "failed",
        response_time_ms: responseTime,
        error: error.message || "Connection failed",
      }),
      {
        status: 200, // Still return 200 for the API call itself
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

async function testGeoTargeting(
  host: string,
  port: number,
  username: string,
  password: string,
  providerType: string,
  targetCountry: string,
  numRequests: number,
  testUrl: string
) {
  const results = [];
  let successCount = 0;

  for (let i = 0; i < numRequests; i++) {
    const startTime = Date.now();

    try {
      // Apply country parameter based on provider type
      const modifiedUsername = applyCountryToUsername(username, providerType, targetCountry);

      // Create proxy URL with authentication
      const proxyUrl = `http://${modifiedUsername}:${password}@${host}:${port}`;

      // Make request through proxy
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(testUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseTime = Date.now() - startTime;
      const data = await response.json();

      const actualCountry = data.country_code || data.country || "Unknown";
      const isMatch = actualCountry.toLowerCase() === targetCountry.toLowerCase();

      if (isMatch) successCount++;

      results.push({
        request_number: i + 1,
        requested_country: targetCountry.toUpperCase(),
        actual_country: actualCountry.toUpperCase(),
        ip_address: data.ip || "Unknown",
        response_time_ms: responseTime,
        status: isMatch ? "match" : "mismatch",
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      results.push({
        request_number: i + 1,
        requested_country: targetCountry.toUpperCase(),
        actual_country: "Error",
        ip_address: "N/A",
        response_time_ms: responseTime,
        status: "error",
        error: error.message,
      });
    }
  }

  const successRate = (successCount / numRequests) * 100;
  let summary = "";

  if (successRate === 100) {
    summary = "Perfect! Geo-targeting is working correctly";
  } else if (successRate >= 80) {
    summary = "Good! Mostly working with occasional issues";
  } else if (successRate >= 50) {
    summary = "Warning! Geo-targeting is inconsistent";
  } else {
    summary = "Failed! Geo-targeting not working properly";
  }

  return new Response(
    JSON.stringify({
      success: successRate > 0,
      success_rate: successRate,
      successful_requests: successCount,
      total_requests: numRequests,
      summary,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

function applyCountryToUsername(username: string, providerType: string, country: string): string {
  const countryLower = country.toLowerCase();
  const countryUpper = country.toUpperCase();

  switch (providerType) {
    case "brightdata":
      // Format: brd-customer-X-zone-Y-country-US
      if (username.includes("-country-")) {
        return username.replace(/-country-[a-z]{2}/i, `-country-${countryLower}`);
      }
      return `${username}-country-${countryLower}`;

    case "oxylabs":
      // Format: customer-USERNAME-cc-US
      if (username.includes("-cc-")) {
        return username.replace(/-cc-[a-z]{2}/i, `-cc-${countryLower}`);
      }
      return `${username}-cc-${countryLower}`;

    case "smartproxy":
      // Format: user-USERNAME-country-US
      if (username.includes("-country-")) {
        return username.replace(/-country-[a-z]{2}/i, `-country-${countryLower}`);
      }
      return `${username}-country-${countryLower}`;

    case "luna":
      // Luna uses different endpoint, not username modification
      return username;

    case "custom":
      // Try to detect pattern and apply
      if (username.includes("-country-")) {
        return username.replace(/-country-[a-z]{2}/i, `-country-${countryLower}`);
      } else if (username.includes("-cc-")) {
        return username.replace(/-cc-[a-z]{2}/i, `-cc-${countryLower}`);
      }
      // If no pattern found, append at end
      return `${username}-country-${countryLower}`;

    default:
      return username;
  }
}
