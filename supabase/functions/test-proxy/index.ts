import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Authentication required');
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: 'Settings not found' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const hasAwsProxy = !!settings.aws_proxy_url;
    const hasResidentialProxy = !!(settings.luna_proxy_host && settings.luna_proxy_port && settings.luna_proxy_username && settings.luna_proxy_password);

    if (!hasAwsProxy && !hasResidentialProxy) {
      return new Response(
        JSON.stringify({ error: 'Neither AWS proxy nor residential proxy credentials configured' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let userIp = 'unknown';
    try {
      const userIpResponse = await fetch('https://api.ipify.org?format=json');
      if (userIpResponse.ok) {
        const userIpData = await userIpResponse.json();
        userIp = userIpData.ip;
      }
    } catch (e) {
      console.error('Failed to get user IP:', e);
    }

    const geoResponse = await fetch(`${supabaseUrl}/functions/v1/get-geolocation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        aws_proxy_url: settings.aws_proxy_url,
        proxy_host: settings.luna_proxy_host,
        proxy_port: settings.luna_proxy_port,
        proxy_username: settings.luna_proxy_username,
        proxy_password: settings.luna_proxy_password,
      }),
    });

    if (!geoResponse.ok) {
      throw new Error('Failed to test residential proxy');
    }

    const geoResult = await geoResponse.json();
    const proxyWorking = userIp !== geoResult.ip && geoResult.ip !== 'unknown';

    return new Response(
      JSON.stringify({
        success: true,
        ip: geoResult.ip,
        country: geoResult.country,
        city: geoResult.city,
        region: geoResult.region,
        proxy_working: proxyWorking,
        user_ip: userIp,
      }),
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
        success: false,
        error: error.message || 'Failed to test residential proxy',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});