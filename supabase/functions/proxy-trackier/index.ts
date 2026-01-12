import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') || ''
    
    // Get AWS backend URL from request or use default
    const backendUrl = 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com'
    
    // Forward the request to AWS backend
    const body = req.method !== 'GET' ? await req.text() : undefined
    
    const response = await fetch(`${backendUrl}${path}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    })

    const data = await response.text()
    
    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }
})
