import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: poolStatus } = await supabase
      .from('ip_rotation_pool')
      .select('status, country, is_healthy')
      .order('country');

    const poolSummary: Record<string, any> = {};

    if (poolStatus) {
      poolStatus.forEach(ip => {
        const country = ip.country || 'unknown';
        if (!poolSummary[country]) {
          poolSummary[country] = {
            total: 0,
            available: 0,
            locked: 0,
            cooldown: 0,
            failed: 0,
            healthy: 0,
            unhealthy: 0,
          };
        }
        poolSummary[country].total++;
        poolSummary[country][ip.status]++;
        if (ip.is_healthy) {
          poolSummary[country].healthy++;
        } else {
          poolSummary[country].unhealthy++;
        }
      });
    }

    const { data: activeRequests } = await supabase
      .from('active_trace_requests')
      .select('status, target_country, started_at, retry_count')
      .in('status', ['pending', 'processing']);

    const requestsSummary = {
      total: activeRequests?.length || 0,
      pending: activeRequests?.filter(r => r.status === 'pending').length || 0,
      processing: activeRequests?.filter(r => r.status === 'processing').length || 0,
      by_country: {} as Record<string, number>,
      retries: activeRequests?.filter(r => r.retry_count > 0).length || 0,
    };

    activeRequests?.forEach(req => {
      const country = req.target_country || 'unknown';
      requestsSummary.by_country[country] = (requestsSummary.by_country[country] || 0) + 1;
    });

    const { data: recentStats } = await supabase
      .from('ip_pool_statistics')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: completedLast5Min } = await supabase
      .from('active_trace_requests')
      .select('trace_time_ms, tracer_mode_used, status')
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    const performanceMetrics = {
      completed_last_5min: completedLast5Min?.length || 0,
      avg_trace_time_ms: completedLast5Min?.length
        ? Math.round(completedLast5Min.reduce((sum, r) => sum + (r.trace_time_ms || 0), 0) / completedLast5Min.length)
        : 0,
      http_only_count: completedLast5Min?.filter(r => r.tracer_mode_used === 'http_only').length || 0,
      browser_count: completedLast5Min?.filter(r => r.tracer_mode_used === 'browser').length || 0,
    };

    const { data: failedLast5Min } = await supabase
      .from('active_trace_requests')
      .select('error_message')
      .in('status', ['failed', 'timeout'])
      .gte('completed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    const healthStatus = {
      pool_utilization_percent: recentStats?.pool_utilization_percent || 0,
      total_ips: Object.values(poolSummary).reduce((sum: number, c: any) => sum + c.total, 0),
      available_ips: Object.values(poolSummary).reduce((sum: number, c: any) => sum + (c.available || 0), 0),
      healthy_ips: Object.values(poolSummary).reduce((sum: number, c: any) => sum + (c.healthy || 0), 0),
      unhealthy_ips: Object.values(poolSummary).reduce((sum: number, c: any) => sum + (c.unhealthy || 0), 0),
      queue_depth: requestsSummary.pending,
      failed_last_5min: failedLast5Min?.length || 0,
      success_rate_5min: completedLast5Min?.length
        ? Math.round((completedLast5Min.length / (completedLast5Min.length + (failedLast5Min?.length || 0))) * 100)
        : 100,
    };

    const warnings = [];
    if (healthStatus.pool_utilization_percent > 80) {
      warnings.push('High pool utilization (>80%) - consider adding more IPs');
    }
    if (healthStatus.unhealthy_ips > 0) {
      warnings.push(`${healthStatus.unhealthy_ips} unhealthy IPs detected`);
    }
    if (healthStatus.queue_depth > 10) {
      warnings.push(`High queue depth (${healthStatus.queue_depth}) - consider increasing worker frequency`);
    }
    if (healthStatus.success_rate_5min < 90) {
      warnings.push(`Low success rate (${healthStatus.success_rate_5min}%) in last 5 minutes`);
    }
    if (requestsSummary.retries > 0) {
      warnings.push(`${requestsSummary.retries} requests requiring retries`);
    }

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pool_summary: poolSummary,
        active_requests: requestsSummary,
        performance: performanceMetrics,
        health: healthStatus,
        warnings,
        recommendation: warnings.length === 0 ? 'System operating normally' : 'Action recommended',
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Monitoring error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Monitoring failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});