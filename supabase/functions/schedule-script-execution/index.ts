// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  } as Record<string, string>;
}

serve(async (req: Request) => {
  const { method } = req;
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || undefined;

  if (method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const action = url.searchParams.get("action") || "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const common = {
      offer_name: body.offer_name,
      account_id: body.account_id,
      client: body.client,
      version: body.version,
      ts: new Date().toISOString(),
    };

    if (action === "check") {
      const offer = (common as any).offer_name as string | undefined;
      const account = (common as any).account_id as string | undefined;
      if (!offer || !account) {
        return new Response(JSON.stringify({ error: "offer_name and account_id are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      // Upsert default config if missing
      const { data: configRow } = await supabase
        .from("script_scheduler_configs")
        .select("id, is_paused, auto_schedule, min_interval_seconds, next_earliest_run_at")
        .eq("offer_name", offer)
        .eq("account_id", account)
        .maybeSingle();

      let isPaused = false;
      let minInterval = 1800; // seconds
      let nextEarliest: string | null = null;

      if (!configRow) {
        const { data: inserted } = await supabase
          .from("script_scheduler_configs")
          .insert({ offer_name: offer, account_id: account })
          .select("id, is_paused, auto_schedule, min_interval_seconds, next_earliest_run_at")
          .single();
        if (inserted) {
          isPaused = inserted.is_paused as boolean;
          minInterval = inserted.min_interval_seconds as number;
          nextEarliest = inserted.next_earliest_run_at as string | null;
        }
      } else {
        isPaused = configRow.is_paused as boolean;
        minInterval = configRow.min_interval_seconds as number;
        nextEarliest = (configRow.next_earliest_run_at as string | null) || null;
      }

      if (isPaused) {
        return new Response(JSON.stringify({ allow: false, reason: "paused", ...common }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const now = new Date();
      const nextAllowed = nextEarliest ? new Date(nextEarliest) : null;
      if (nextAllowed && now < nextAllowed) {
        return new Response(JSON.stringify({ allow: false, reason: "too_soon", next_allowed_at: nextAllowed.toISOString(), ...common }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      // Allowed: set new window
      const next = new Date(now.getTime() + minInterval * 1000);
      await supabase
        .from("script_scheduler_configs")
        .update({ last_allowed_at: now.toISOString(), next_earliest_run_at: next.toISOString() })
        .eq("offer_name", offer)
        .eq("account_id", account);

      const res = { allow: true, reason: null, next_allowed_at: next.toISOString(), ...common };
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "report") {
      const offer = (common as any).offer_name as string | undefined;
      const account = (common as any).account_id as string | undefined;
      const summary = body.summary || {};

      if (offer && account) {
        try {
          await supabase.from("script_executions").insert({
            offer_name: offer,
            account_id: account,
            client: (common as any).client,
            version: (common as any).version,
            status: "finished",
            started_at: summary.started_at || null,
            finished_at: summary.finished_at || new Date().toISOString(),
            total_api_calls: summary.total_api_calls || null,
            total_campaigns_updated: summary.total_campaigns_updated || null,
            total_campaigns_failed: summary.total_campaigns_failed || null,
          });

          // Calculate next run from START time + interval (not finish time)
          const { data: cfg } = await supabase
            .from("script_scheduler_configs")
            .select("auto_schedule, min_interval_seconds")
            .eq("offer_name", offer)
            .eq("account_id", account)
            .maybeSingle();

          const updates: Record<string, any> = {
            last_run_at: summary.finished_at || new Date().toISOString(),
          };

          // If auto_schedule is enabled, calculate next run from start time
          if (cfg?.auto_schedule && summary.started_at) {
            const startedAt = new Date(summary.started_at);
            const intervalSec = cfg.min_interval_seconds || 1800;
            const nextRun = new Date(startedAt.getTime() + intervalSec * 1000);
            updates.next_earliest_run_at = nextRun.toISOString();
            
            if (summary.finished_at) {
              const finishedAt = new Date(summary.finished_at);
              updates.last_run_duration_ms = finishedAt.getTime() - startedAt.getTime();
            }
          }

          await supabase
            .from("script_scheduler_configs")
            .update(updates)
            .eq("offer_name", offer)
            .eq("account_id", account);
        } catch (_) {}
      }

      const res = { ok: true, received: { ...common, summary } };
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "update_config") {
      const offer = (common as any).offer_name as string | undefined;
      const account = (common as any).account_id as string | undefined;
      if (!offer || !account) {
        return new Response(JSON.stringify({ error: "offer_name and account_id are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const isPaused = typeof body.is_paused === "boolean" ? body.is_paused : undefined;
      const autoSchedule = typeof body.auto_schedule === "boolean" ? body.auto_schedule : undefined;
      const minInterval = typeof body.min_interval_seconds === "number" ? body.min_interval_seconds : undefined;
      if (isPaused === undefined && minInterval === undefined && autoSchedule === undefined) {
        return new Response(JSON.stringify({ error: "No config fields provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      // Ensure row exists
      const { data: existing } = await supabase
        .from("script_scheduler_configs")
        .select("id")
        .eq("offer_name", offer)
        .eq("account_id", account)
        .maybeSingle();

      if (!existing) {
        await supabase.from("script_scheduler_configs").insert({ offer_name: offer, account_id: account });
      }

      const update: Record<string, any> = {};
      if (isPaused !== undefined) update.is_paused = isPaused;
      if (autoSchedule !== undefined) update.auto_schedule = autoSchedule;
      if (minInterval !== undefined) update.min_interval_seconds = minInterval;

      const { data: updated, error: upErr } = await supabase
        .from("script_scheduler_configs")
        .update(update)
        .eq("offer_name", offer)
        .eq("account_id", account)
        .select("offer_name, account_id, is_paused, auto_schedule, min_interval_seconds, next_earliest_run_at, last_allowed_at, last_run_at")
        .single();

      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      return new Response(JSON.stringify({ ok: true, config: updated }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "get_config") {
      const offer = (common as any).offer_name as string | undefined;
      const account = (common as any).account_id as string | undefined;
      if (!offer || !account) {
        return new Response(JSON.stringify({ error: "offer_name and account_id are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      let { data: cfg } = await supabase
        .from("script_scheduler_configs")
        .select("offer_name, account_id, is_paused, auto_schedule, min_interval_seconds, next_earliest_run_at, last_allowed_at, last_run_at")
        .eq("offer_name", offer)
        .eq("account_id", account)
        .maybeSingle();

      if (!cfg) {
        const { data: inserted } = await supabase
          .from("script_scheduler_configs")
          .insert({ offer_name: offer, account_id: account })
          .select("offer_name, account_id, is_paused, auto_schedule, min_interval_seconds, next_earliest_run_at, last_allowed_at, last_run_at")
          .single();
        cfg = inserted ?? null;
      }

      return new Response(JSON.stringify({ ok: true, config: cfg }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "list_executions") {
      const offer = (common as any).offer_name as string | undefined;
      const account = (common as any).account_id as string | undefined;
      if (!offer || !account) {
        return new Response(JSON.stringify({ error: "offer_name and account_id are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const { data, error } = await supabase
        .from("script_executions")
        .select("id, client, version, status, started_at, finished_at, total_api_calls, total_campaigns_updated, total_campaigns_failed, created_at")
        .eq("offer_name", offer)
        .eq("account_id", account)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      return new Response(JSON.stringify({ ok: true, executions: data ?? [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
});
