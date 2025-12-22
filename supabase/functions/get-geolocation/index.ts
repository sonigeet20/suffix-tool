import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GeoLocationData {
  ip: string;
  country?: string;
  city?: string;
  region?: string;
  full_data: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { aws_proxy_url, proxy_host, proxy_port, proxy_username, proxy_password } = await req.json();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let geoData;

    if (aws_proxy_url) {
      const proxyResponse = await fetch(aws_proxy_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'http://ip-api.com/json/',
          method: 'GET',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!proxyResponse.ok) {
        throw new Error(`AWS proxy error: ${proxyResponse.status}`);
      }

      const proxyResult = await proxyResponse.json();
      if (proxyResult.error) {
        throw new Error(proxyResult.error);
      }

      geoData = JSON.parse(proxyResult.body);
    } else if (proxy_host && proxy_port && proxy_username && proxy_password) {
      const auth = btoa(`${proxy_username}:${proxy_password}`);
      const proxyUrl = `http://${proxy_host}:${proxy_port}`;

      const ipCheckResponse = await fetch('http://ip-api.com/json/', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Proxy-Authorization': `Basic ${auth}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!ipCheckResponse.ok) {
        throw new Error(`IP check error: ${ipCheckResponse.status}`);
      }

      geoData = await ipCheckResponse.json();
    } else {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Either AWS proxy URL or residential proxy credentials required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result: GeoLocationData = {
      ip: geoData.query || 'unknown',
      country: geoData.country || geoData.countryCode,
      city: geoData.city,
      region: geoData.regionName || geoData.region,
      full_data: geoData,
    };

    return new Response(
      JSON.stringify(result),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to fetch geolocation',
        ip: 'unknown',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});