import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const accountId = body.account_id || body.accountId;
    const offerName = body.offer_name || body.offerName;
    const suffixes = body.suffixes;

    if (!accountId || !offerName || !Array.isArray(suffixes)) {
      return new Response(JSON.stringify({ error: 'account_id, offer_name, and suffixes array are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rows = suffixes.map((item: any) => {
      const suffix = item.suffix || '';
      return {
        account_id: accountId,
        offer_name: offerName,
        suffix,
        // For uniqueness we reuse the suffix string as hash; unique constraint will prevent dupes
        suffix_hash: suffix,
        source: item.source || 'traced',
        original_clicks: item.clicks || 0,
        original_impressions: item.impressions || 0
      };
    }).filter((row: any) => row.suffix);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid suffixes provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Insert, ignore duplicates by suffix_hash unique constraint
    const { error } = await supabase.from('v5_suffix_bucket').insert(rows, { ignoreDuplicates: true });
    if (error) {
      console.error('store traced suffixes error:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to store suffixes', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, stored: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Handler error:', error.message || error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
