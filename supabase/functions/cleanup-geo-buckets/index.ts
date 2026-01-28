// Cleanup Geo Buckets Edge Function
// Removes old used suffixes to prevent database bloat
// Run via cron (e.g., daily at midnight UTC)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  offer_name?: string // Clean specific offer, or all if not specified
  days_old?: number // Delete suffixes used more than X days ago (default: 7)
  max_use_count?: number // Delete suffixes used more than X times (default: 1000)
  dry_run?: boolean // If true, don't delete, just report what would be deleted
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request
    const body: CleanupRequest = req.method === 'POST' 
      ? await req.json() 
      : {}
    
    const { 
      offer_name,
      days_old = 7,
      max_use_count = 1000,
      dry_run = false
    } = body

    console.log(`[cleanup-geo-buckets] Starting cleanup (dry_run: ${dry_run})`)
    console.log(`[cleanup-geo-buckets] Criteria: ${days_old} days old OR ${max_use_count}+ uses`)
    if (offer_name) {
      console.log(`[cleanup-geo-buckets] Targeting offer: ${offer_name}`)
    }

    // Calculate cutoff date
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days_old)
    const cutoffDateStr = cutoffDate.toISOString()

    // Build query to find suffixes to delete
    let query = supabase
      .from('geo_suffix_buckets')
      .select('id, offer_name, target_country, suffix, used_at, use_count')
      .eq('is_used', true)
      .or(`used_at.lt.${cutoffDateStr},use_count.gte.${max_use_count}`)

    if (offer_name) {
      query = query.eq('offer_name', offer_name)
    }

    const { data: toDelete, error: selectError } = await query

    if (selectError) {
      throw selectError
    }

    if (!toDelete || toDelete.length === 0) {
      console.log('[cleanup-geo-buckets] No suffixes to delete')
      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: 0,
          message: 'No suffixes met deletion criteria',
          criteria: {
            days_old,
            max_use_count,
            cutoff_date: cutoffDateStr
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`[cleanup-geo-buckets] Found ${toDelete.length} suffixes to delete`)

    // Group by offer for reporting
    const byOffer = toDelete.reduce((acc, item) => {
      if (!acc[item.offer_name]) {
        acc[item.offer_name] = []
      }
      acc[item.offer_name].push(item)
      return acc
    }, {} as Record<string, any[]>)

    const summary = Object.entries(byOffer).map(([name, items]) => ({
      offer_name: name,
      count: items.length,
      oldest_used: items.reduce((min, item) => 
        !min || item.used_at < min ? item.used_at : min, null
      ),
      max_uses: Math.max(...items.map(item => item.use_count))
    }))

    console.log('[cleanup-geo-buckets] Summary by offer:', summary)

    // Perform deletion if not dry run
    let deletedCount = 0
    if (!dry_run) {
      const idsToDelete = toDelete.map(item => item.id)
      
      const { error: deleteError } = await supabase
        .from('geo_suffix_buckets')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        throw deleteError
      }

      deletedCount = toDelete.length
      console.log(`[cleanup-geo-buckets] Deleted ${deletedCount} suffixes`)
    } else {
      console.log('[cleanup-geo-buckets] Dry run - no deletions performed')
    }

    // Also reset daily click counters if it's past midnight UTC
    const today = new Date().toISOString().split('T')[0]
    const { data: oldStats, error: statsError } = await supabase
      .from('google_ads_click_stats')
      .select('id, offer_name, click_date')
      .lt('click_date', today)

    let statsDeleted = 0
    if (!statsError && oldStats && oldStats.length > 0 && !dry_run) {
      const statsIds = oldStats.map(s => s.id)
      const { error: deleteStatsError } = await supabase
        .from('google_ads_click_stats')
        .delete()
        .in('id', statsIds)

      if (!deleteStatsError) {
        statsDeleted = oldStats.length
        console.log(`[cleanup-geo-buckets] Deleted ${statsDeleted} old click stats`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        deleted_count: deletedCount,
        stats_deleted: statsDeleted,
        summary,
        criteria: {
          days_old,
          max_use_count,
          cutoff_date: cutoffDateStr,
          offer_name: offer_name || 'all'
        },
        sample_deleted: toDelete.slice(0, 10).map(item => ({
          offer: item.offer_name,
          country: item.target_country,
          used_at: item.used_at,
          use_count: item.use_count,
          suffix_preview: item.suffix.substring(0, 50) + '...'
        }))
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[cleanup-geo-buckets] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
