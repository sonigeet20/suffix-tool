import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the master purge function
    const { data, error } = await supabase.rpc('v5_purge_all_old_data');

    if (error) {
      console.error('[v5-purge] RPC error:', error);
      throw error;
    }

    console.log('[v5-purge] Cleanup completed:', {
      campaign_logs_purged: data?.campaign_logs_purged || 0,
      trace_logs_purged: data?.trace_logs_purged || 0,
      bucket_entries_purged: data?.bucket_entries_purged || 0
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Purge completed',
        stats: data
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('[v5-purge] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
