import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TracerRequest {
  url: string;
  mode?: 'auto' | 'http_only' | 'browser' | 'anti_cloaking';
  proxy_ip?: string;
  proxy_port?: string;
  target_country?: string;
  referrer?: string;
  max_redirects?: number;
  timeout_ms?: number;
  aws_proxy_url?: string;
}

interface TracerResult {
  success: boolean;
  mode_used: 'http_only' | 'browser' | 'anti_cloaking';
  detection_reason?: string;
  chain: any[];
  final_url: string;
  extracted_params: Record<string, string>;
  timing_ms: number;
  bandwidth_kb?: number;
  popup_chains?: any[];
  obfuscated_urls?: any[];
  cloaking_indicators?: string[];
  aggressiveness_level?: string;
  total_popups?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tracerRequest: TracerRequest = await req.json();
    const {
      url,
      mode = 'auto',
      proxy_ip,
      proxy_port = '7000',
      target_country = 'us',
      referrer,
      max_redirects = 20,
      timeout_ms = 60000,
      aws_proxy_url
    } = tracerRequest;

    console.log('🧠 Intelligent Tracer Request:', { url, mode, target_country });

    const startTime = Date.now();
    let result: TracerResult;

    if (mode === 'anti_cloaking') {
      // Force anti-cloaking mode
      console.log('🕵️ Using Anti-Cloaking Mode (forced)');
      result = await traceAntiCloaking(url, aws_proxy_url!, proxy_ip, proxy_port, target_country, referrer, timeout_ms);
      result.mode_used = 'anti_cloaking';
      result.detection_reason = 'User selected anti-cloaking mode';
    } else if (mode === 'browser') {
      // Force browser mode
      console.log('🌐 Using Browser Mode (forced)');
      result = await traceBrowser(url, aws_proxy_url!, proxy_ip, proxy_port, target_country, referrer, timeout_ms);
      result.mode_used = 'browser';
      result.detection_reason = 'User selected browser mode';
    } else if (mode === 'http_only') {
      // Force HTTP-only mode
      console.log('⚡ Using HTTP-Only Mode (forced)');
      result = await traceHttpOnly(url, aws_proxy_url!, proxy_ip, proxy_port, target_country, referrer, max_redirects, timeout_ms);
      result.mode_used = 'http_only';
      result.detection_reason = 'User selected HTTP-only mode';
    } else {
      // Auto detection: Try HTTP-only first, fallback to browser
      console.log('🤖 Auto Mode: Trying HTTP-only first...');
      
      const httpResult = await traceHttpOnly(url, aws_proxy_url!, proxy_ip, proxy_port, target_country, referrer, max_redirects, 10000);
      
      // Check if HTTP-only was successful
      const needsBrowser = shouldUseBrowser(httpResult, url);
      
      if (needsBrowser) {
        console.log('🔄 HTTP-only insufficient, falling back to Browser Mode');
        console.log('   Reason:', needsBrowser);
        result = await traceBrowser(url, aws_proxy_url!, proxy_ip, proxy_port, target_country, referrer, timeout_ms);
        result.mode_used = 'browser';
        result.detection_reason = needsBrowser;
      } else {
        console.log('✅ HTTP-only successful, no browser needed');
        result = httpResult;
        result.mode_used = 'http_only';
        result.detection_reason = 'Simple redirect chain, HTTP-only sufficient';
      }
    }

    result.timing_ms = Date.now() - startTime;

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Intelligent Tracer Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Tracer failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function shouldUseBrowser(httpResult: TracerResult, originalUrl: string): string | false {
  // Check if HTTP-only failed
  if (!httpResult.success) {
    return 'HTTP-only trace failed';
  }

  // Check if we're still on the same domain (no redirect happened)
  const originalDomain = new URL(originalUrl).hostname;
  const finalDomain = new URL(httpResult.final_url).hostname;
  
  if (originalDomain === finalDomain && httpResult.chain.length <= 1) {
    return 'No redirects detected, likely needs JavaScript execution';
  }

  // Check if final URL has very few params (might be missing dynamic params)
  const paramCount = Object.keys(httpResult.extracted_params).length;
  if (paramCount === 0 && httpResult.chain.length > 1) {
    return 'No parameters extracted from redirect chain';
  }

  // Check for common signs of JavaScript-heavy sites
  const lastStep = httpResult.chain[httpResult.chain.length - 1];
  if (lastStep?.html_snippet) {
    const html = lastStep.html_snippet.toLowerCase();
    if (html.includes('react') || html.includes('vue') || html.includes('angular') || html.includes('__next')) {
      return 'JavaScript framework detected (React/Vue/Angular)';
    }
  }

  // HTTP-only was sufficient
  return false;
}

async function traceHttpOnly(
  url: string,
  awsProxyUrl: string,
  proxyIp: string | undefined,
  proxyPort: string,
  targetCountry: string,
  referrer: string | undefined,
  maxRedirects: number,
  timeoutMs: number
): Promise<TracerResult> {
  console.log('⚡ Starting HTTP-Only Trace...');
  
  const payload = {
    url,
    max_redirects: maxRedirects,
    timeout_ms: timeoutMs,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    target_country: targetCountry,
    proxy_ip: proxyIp,
    proxy_port: proxyPort,
    referrer: referrer,
    mode: 'http_only',
  };

  const response = await fetch(`${awsProxyUrl}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });

  if (!response.ok) {
    throw new Error(`HTTP-only trace failed: ${response.status}`);
  }

  const result = await response.json();
  
  const finalUrl = result.chain?.[result.chain.length - 1]?.url || url;
  const finalUrlObj = new URL(finalUrl);
  const extractedParams: Record<string, string> = {};
  
  finalUrlObj.searchParams.forEach((value, key) => {
    extractedParams[key] = value;
  });

  // Estimate bandwidth (HTTP-only is very light)
  const bandwidthKb = Math.round(JSON.stringify(result).length / 1024);

  return {
    success: result.success || false,
    mode_used: 'http_only',
    chain: result.chain || [],
    final_url: finalUrl,
    extracted_params: extractedParams,
    timing_ms: result.total_timing_ms || 0,
    bandwidth_kb: bandwidthKb,
  };
}

async function traceBrowser(
  url: string,
  awsProxyUrl: string,
  proxyIp: string | undefined,
  proxyPort: string,
  targetCountry: string,
  referrer: string | undefined,
  timeoutMs: number
): Promise<TracerResult> {
  console.log('🌐 Starting Browser Trace...');
  
  const payload = {
    url,
    timeout_ms: timeoutMs,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    target_country: targetCountry,
    proxy_ip: proxyIp,
    proxy_port: proxyPort,
    referrer: referrer,
    mode: 'browser',
    block_resources: true,
    extract_only: true,
  };

  const response = await fetch(`${awsProxyUrl}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs + 10000),
  });

  if (!response.ok) {
    throw new Error(`Browser trace failed: ${response.status}`);
  }

  const result = await response.json();

  const finalUrl = result.final_url || url;
  const extractedParams = result.extracted_params || {};

  // Browser mode uses more bandwidth
  const bandwidthKb = result.bandwidth_kb || 500;

  return {
    success: result.success || false,
    mode_used: 'browser',
    chain: result.chain || [],
    final_url: finalUrl,
    extracted_params: extractedParams,
    timing_ms: result.timing_ms || 0,
    bandwidth_kb: bandwidthKb,
    popup_chains: result.popup_chains || [],
    total_popups: result.total_popups || 0,
  };
}

async function traceAntiCloaking(
  url: string,
  awsProxyUrl: string,
  proxyIp: string | undefined,
  proxyPort: string,
  targetCountry: string,
  referrer: string | undefined,
  timeoutMs: number
): Promise<TracerResult> {
  console.log('🕵️ Starting Anti-Cloaking Trace...');

  const payload = {
    url,
    timeout_ms: timeoutMs,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    target_country: targetCountry,
    proxy_ip: proxyIp,
    proxy_port: proxyPort,
    referrer: referrer,
    mode: 'anti_cloaking',
  };

  const response = await fetch(`${awsProxyUrl}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs + 15000),
  });

  if (!response.ok) {
    throw new Error(`Anti-cloaking trace failed: ${response.status}`);
  }

  const result = await response.json();

  const finalUrl = result.final_url || url;
  const extractedParams = result.extracted_params || {};

  const bandwidthKb = result.bandwidth_kb || 700;

  return {
    success: result.success || false,
    mode_used: 'anti_cloaking',
    chain: result.chain || [],
    final_url: finalUrl,
    extracted_params: extractedParams,
    timing_ms: result.timing_ms || 0,
    bandwidth_kb: bandwidthKb,
    popup_chains: result.popup_chains || [],
    obfuscated_urls: result.obfuscated_urls || [],
    cloaking_indicators: result.cloaking_indicators || [],
    aggressiveness_level: result.aggressiveness_level || 'low',
    total_popups: result.total_popups || 0,
  };
}
