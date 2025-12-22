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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Starting IP pool maintenance...');

    // Step 1: Release expired IP locks
    console.log('⏰ Releasing expired IP locks...');
    const { error: releaseError } = await supabase.rpc('release_expired_ip_locks');
    if (releaseError) {
      console.error('❌ Failed to release expired locks:', releaseError);
    } else {
      console.log('✅ Expired locks released');
    }

    // Step 2: Cleanup timed-out requests
    console.log('⏱️ Cleaning up timed-out requests...');
    const { error: cleanupError } = await supabase.rpc('cleanup_timed_out_requests');
    if (cleanupError) {
      console.error('❌ Failed to cleanup timed-out requests:', cleanupError);
    } else {
      console.log('✅ Timed-out requests cleaned up');
    }

    // Step 3: Record pool statistics
    console.log('📊 Recording pool statistics...');
    const { error: statsError } = await supabase.rpc('record_pool_statistics');
    if (statsError) {
      console.error('❌ Failed to record statistics:', statsError);
    } else {
      console.log('✅ Statistics recorded');
    }

    // Step 4: Get current pool status
    const { data: poolStatus, error: poolError } = await supabase
      .from('ip_rotation_pool')
      .select('status, country')
      .eq('is_healthy', true);

    if (!poolError && poolStatus) {
      const statusCounts = poolStatus.reduce((acc: any, ip: any) => {
        acc[ip.status] = (acc[ip.status] || 0) + 1;
        return acc;
      }, {});

      console.log('📈 Current pool status:', statusCounts);
      console.log('📈 Total healthy IPs:', poolStatus.length);
    }

    // Step 5: Check for unhealthy IPs
    const { data: unhealthyIPs, error: unhealthyError } = await supabase
      .from('ip_rotation_pool')
      .select('ip_address, consecutive_failures')
      .eq('is_healthy', false);

    if (!unhealthyError && unhealthyIPs && unhealthyIPs.length > 0) {
      console.warn('⚠️ Unhealthy IPs detected:', unhealthyIPs.length);
      unhealthyIPs.forEach((ip: any) => {
        console.warn(`  - ${ip.ip_address}: ${ip.consecutive_failures} consecutive failures`);
      });
    }

    // Step 6: Get active requests count
    const { data: activeRequests, error: activeError } = await supabase
      .from('active_trace_requests')
      .select('status')
      .in('status', ['pending', 'processing']);

    const activeCount = activeRequests?.length || 0;
    console.log('🔄 Active trace requests:', activeCount);

    // Step 7: Calculate pool utilization
    const availableIPs = poolStatus?.filter((ip: any) => ip.status === 'available').length || 0;
    const totalIPs = poolStatus?.length || 0;
    const utilization = totalIPs > 0 ? Math.round(((totalIPs - availableIPs) / totalIPs) * 100) : 0;

    console.log('💯 Pool utilization:', utilization + '%');

    if (utilization > 80) {
      console.warn('⚠️ HIGH UTILIZATION WARNING: Consider provisioning more IPs');
    }

    console.log('✅ Maintenance completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        maintenance_completed: true,
        pool_stats: {
          total_ips: totalIPs,
          available_ips: availableIPs,
          utilization_percent: utilization,
          active_requests: activeCount,
          unhealthy_ips: unhealthyIPs?.length || 0,
        },
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('❌ Maintenance error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Maintenance failed',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});