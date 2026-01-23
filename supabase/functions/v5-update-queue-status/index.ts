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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    const body = await req.json();
    const { queue_ids, status, error_message } = body;

    if (!queue_ids || !Array.isArray(queue_ids) || queue_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid queue_ids array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!status || !['processing', 'completed', 'failed'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid status. Must be processing, completed, or failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const updates: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'processing') {
      updates.processing_started_at = new Date().toISOString();
    } else if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (status === 'failed') {
      updates.error_message = error_message || 'Unknown error';
      updates.last_error_at = new Date().toISOString();
      updates.attempts = supabase.rpc('increment', { amount: 1 }); // Increment attempts
    }

    const { error } = await supabase
      .from('v5_webhook_queue')
      .update(updates)
      .in('id', queue_ids);

    if (error) {
      console.error('Update queue status error:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to update queue status', 
        details: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      updated: queue_ids.length,
      status
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Handler error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
