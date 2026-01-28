// Check Click Failures and Send Slack Alerts
// Monitors recent click events and sends alerts when traces fail

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { offer_name, event_id } = body

    console.log(`[check-and-alert] Checking for offer: ${offer_name}`)

    // Check if alert should be sent
    const { data: shouldAlert, error: alertError } = await supabase
      .rpc('should_send_alert', { p_offer_name: offer_name })

    if (alertError) {
      console.error('[check-and-alert] Error checking alert status:', alertError)
      throw alertError
    }

    if (!shouldAlert) {
      console.log('[check-and-alert] No alert needed')
      return new Response(
        JSON.stringify({ alert_sent: false, reason: 'threshold_not_met_or_cooldown' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get alert config
    const { data: config, error: configError } = await supabase
      .from('google_ads_alert_config')
      .select('*')
      .eq('offer_name', offer_name)
      .single()

    if (configError || !config) {
      console.error('[check-and-alert] No alert config found')
      return new Response(
        JSON.stringify({ alert_sent: false, reason: 'no_config' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get recent failures
    const { data: recentEvents, error: eventsError } = await supabase
      .rpc('get_recent_click_events', {
        p_offer_name: offer_name,
        p_limit: config.check_last_n_clicks
      })

    if (eventsError) {
      console.error('[check-and-alert] Error fetching recent events:', eventsError)
      throw eventsError
    }

    const failedEvents = recentEvents?.filter((e: any) => e.trace_success === false) || []
    const failureCount = failedEvents.length
    const totalCount = recentEvents?.length || 0

    // Build Slack message
    const slackMessage = {
      text: `🚨 *Google Ads Trace Failures Alert*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Google Ads Trace Failures Detected',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Offer:*\n${offer_name}`
            },
            {
              type: 'mrkdwn',
              text: `*Failures:*\n${failureCount} out of ${totalCount} traces`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Last 3 Failures:*`
          }
        }
      ]
    }

    // Add details of last 3 failures
    failedEvents.slice(0, 3).forEach((event: any) => {
      slackMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *Suffix:* \`${event.suffix}\`\n  *Error:* ${event.trace_error || 'Unknown error'}\n  *Time:* ${new Date(event.click_timestamp).toLocaleString()}`
        }
      })
    })

    slackMessage.blocks.push({
      type: 'divider'
    })

    slackMessage.blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Alert triggered at ${new Date().toLocaleString()} | Threshold: ${config.alert_threshold} failures`
        }
      ]
    })

    // Send to Slack
    const slackResponse = await fetch(config.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    })

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text()
      console.error('[check-and-alert] Slack API error:', errorText)
      throw new Error(`Slack API error: ${errorText}`)
    }

    console.log('[check-and-alert] Alert sent successfully')

    return new Response(
      JSON.stringify({
        alert_sent: true,
        failure_count: failureCount,
        total_count: totalCount,
        offer_name: offer_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[check-and-alert] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
