import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WorkerRequest {
  batch_size?: number;
  max_concurrent?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { batch_size = 10, max_concurrent = 5 } = await req.json() as WorkerRequest;

    console.log('🔄 Background worker starting...');
    console.log('   Batch size:', batch_size);
    console.log('   Max concurrent:', max_concurrent);

    await supabase.rpc('release_expired_ip_locks');
    await supabase.rpc('cleanup_timed_out_requests');

    const { data: pendingRequests, error: fetchError } = await supabase
      .from('active_trace_requests')
      .select('*')
      .in('status', ['pending', 'processing'])
      .lte('retry_count', 2)
      .order('started_at', { ascending: true })
      .limit(batch_size);

    if (fetchError) {
      console.error('❌ Failed to fetch pending requests:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch requests' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('✅ No pending requests to process');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending requests' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingRequests.length} pending requests`);

    const stuckRequests = pendingRequests.filter(req => {
      const startedAt = new Date(req.started_at).getTime();
      const now = Date.now();
      return req.status === 'processing' && (now - startedAt > 120000);
    });

    if (stuckRequests.length > 0) {
      console.log(`🔧 Resetting ${stuckRequests.length} stuck requests`);
      for (const stuckReq of stuckRequests) {
        await supabase
          .from('active_trace_requests')
          .update({
            status: 'pending',
            retry_count: stuckReq.retry_count + 1,
          })
          .eq('request_id', stuckReq.request_id);

        if (stuckReq.ip_assigned) {
          await supabase.rpc('release_ip', {
            p_ip_address: stuckReq.ip_assigned,
            p_success: false,
          });
        }
      }
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    const processInBatches = async (items: any[], concurrency: number) => {
      const batches = [];
      for (let i = 0; i < items.length; i += concurrency) {
        batches.push(items.slice(i, i + concurrency));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (request) => {
            try {
              console.log(`🔄 Processing request ${request.request_id}`);

              const response = await fetch(`${supabaseUrl}/functions/v1/process-trace-parallel`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  request_id: request.request_id,
                  offer_id: request.offer_id,
                  tracking_url: request.tracking_url,
                  target_country: request.target_country,
                  inbound_params: request.inbound_params,
                }),
                signal: AbortSignal.timeout(70000),
              });

              if (response.ok) {
                console.log(`✅ Successfully processed ${request.request_id}`);
                results.succeeded++;
              } else {
                const errorText = await response.text();
                console.error(`❌ Failed to process ${request.request_id}:`, errorText);
                results.failed++;
                results.errors.push(`${request.request_id}: ${errorText}`);

                await supabase
                  .from('active_trace_requests')
                  .update({
                    status: 'failed',
                    error_message: `Worker failed: ${errorText}`,
                    completed_at: new Date().toISOString(),
                  })
                  .eq('request_id', request.request_id);
              }

              results.processed++;
            } catch (err: any) {
              console.error(`❌ Exception processing ${request.request_id}:`, err);
              results.failed++;
              results.errors.push(`${request.request_id}: ${err.message}`);

              await supabase
                .from('active_trace_requests')
                .update({
                  status: 'failed',
                  error_message: `Worker exception: ${err.message}`,
                  completed_at: new Date().toISOString(),
                })
                .eq('request_id', request.request_id);

              results.processed++;
            }
          })
        );
      }
    };

    await processInBatches(pendingRequests.filter(r => r.status === 'pending'), max_concurrent);

    await supabase.rpc('record_pool_statistics');

    console.log('🎉 Background worker completed');
    console.log('   Processed:', results.processed);
    console.log('   Succeeded:', results.succeeded);
    console.log('   Failed:', results.failed);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Background worker error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Worker failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});