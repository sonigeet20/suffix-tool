/*
 * Standalone universal tracer prototype (does not touch server.js).
 * Goal: fast (<5s typical) redirect resolution via staged pipeline:
 *   Phase 1: HTTP-only hop expansion with short timeouts.
 *   Phase 2: HTML/static analysis to extract likely finals (meta refresh, query params, JS strings).
 *   Phase 3: Optional lightweight verification of best candidate with a capped request.
 */

const { URL } = require('url');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Common redirect param keys seen across affiliate networks and shorteners.
const PARAM_KEYS = [
  'url', 'u', 'redirect', 'redirect_uri', 'redirect_url', 'redir', 'target', 'dest',
  'destination', 'deeplink', 'dl', 'out', 'r', 'to', 'goto', 'return', 'next', 'continue', 'q'
];

const CONFIDENCE = {
  meta_refresh: 0.9,
  js_location: 0.85,
  param: 0.6,
  generic_html: 0.3,
};

// Some affiliate hops are consistently slower; give them a higher timeout budget.
const SLOW_DOMAIN_PATTERNS = [/awin1\.com/i, /doubleclick\.net/i, /elcorteingles\.es/i];

function isSlowDomain(url) {
  return SLOW_DOMAIN_PATTERNS.some((p) => p.test(url || ''));
}

// Choose the highest-confidence candidate from an array
function pickBestCandidate(list) {
  if (!list || list.length === 0) return null;
  return list.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
}

const DEFAULTS = {
  maxMs: 22000,
  maxHops: 10,
  maxBodyBytes: 256 * 1024,
  requestTimeoutMs: 10000,
  verifyTimeoutMs: 10000,
  followHops: 8,
  proxyUrl: process.env.PROXY_URL || null,
};

// Cache proxy settings from Supabase settings table (matches server.js fields)
let proxySettingsCache = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function loadProxySettingsFromSupabase() {
  if (!supabase) return null;
  if (proxySettingsCache) return proxySettingsCache;
  const { data, error } = await supabase
    .from('settings')
    .select('luna_proxy_host, luna_proxy_port, luna_proxy_username, luna_proxy_password')
    .maybeSingle();
  if (error || !data) return null;
  if (!data.luna_proxy_host || !data.luna_proxy_port || !data.luna_proxy_username || !data.luna_proxy_password) {
    return null;
  }
  proxySettingsCache = {
    host: data.luna_proxy_host,
    port: data.luna_proxy_port,
    username: data.luna_proxy_username,
    password: data.luna_proxy_password,
  };
  return proxySettingsCache;
}

function buildLunaProxyUrl(settings, targetCountry) {
  if (!settings) return null;
  let user = settings.username;
  if (targetCountry && targetCountry.length === 2) {
    user = `${user}-region-${targetCountry.toLowerCase()}`;
  }
  return `http://${user}:${settings.password}@${settings.host}:${settings.port}`;
}

function now() {
  return Date.now();
}

function timeLeft(started, maxMs) {
  return Math.max(0, maxMs - (now() - started));
}

function resolveUrl(base, candidate) {
  try {
    return new URL(candidate, base).toString();
  } catch (_) {
    return null;
  }
}

async function resolveProxyUrl(opts) {
  if (opts.proxyUrl) return opts.proxyUrl;
  if (process.env.PROXY_URL) return process.env.PROXY_URL;
  const settings = await loadProxySettingsFromSupabase();
  if (settings) {
    return buildLunaProxyUrl(settings, opts.targetCountry);
  }
  return null;
}

function buildAxiosAgents(proxyUrl) {
  if (!proxyUrl) return {};
  const agent = new HttpsProxyAgent(proxyUrl);
  return { httpAgent: agent, httpsAgent: agent }; // HttpsProxyAgent handles both schemes
}

async function httpHopChain(initialUrl, opts) {
  const chain = [];
  let currentUrl = initialUrl;
  let finalResponse = null;
  const resolvedProxy = await resolveProxyUrl(opts);
  const agentCfg = buildAxiosAgents(resolvedProxy);
  let totalBytes = 0;

  for (let i = 0; i < opts.maxHops; i++) {
    const remaining = timeLeft(opts.started, opts.maxMs);
    if (remaining <= 0) break;

    try {
      const perRequestTimeout = Math.min(
        Math.round(opts.requestTimeoutMs * (isSlowDomain(currentUrl) ? 2.0 : 1)),
        remaining,
      );

      const response = await axios({
        url: currentUrl,
        method: 'get',
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: perRequestTimeout,
        headers: {
          'user-agent': opts.userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'arraybuffer',
        ...agentCfg,
      });

      const contentType = response.headers['content-type'] || '';
      const isHtml = contentType.includes('text/html');
      const rawBuf = Buffer.from(response.data || '');
      const body = isHtml ? rawBuf.slice(0, opts.maxBodyBytes) : null;
      const bytes = rawBuf.length;
      totalBytes += bytes;

      chain.push({
        url: currentUrl,
        status: response.status,
        location: response.headers.location || null,
        contentType,
        bandwidth_bytes: bytes,
      });

      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        currentUrl = resolveUrl(currentUrl, response.headers.location) || response.headers.location;
        continue;
      }

      finalResponse = {
        url: currentUrl,
        status: response.status,
        contentType,
        body,
        bandwidth_bytes: bytes,
      };
      break;
    } catch (error) {
      chain.push({ url: currentUrl, status: 'error', error: error.message });
      break;
    }
  }

  return { chain, finalResponse, bandwidth_bytes: totalBytes };
}

function extractCandidatesFromUrl(urlStr) {
  const candidates = [];
  try {
    const u = new URL(urlStr);
    for (const key of PARAM_KEYS) {
      const val = u.searchParams.get(key) || u.hash?.split(`${key}=`)[1];
      if (val) {
        const decoded = decodeURIComponent(val);
        if (decoded.startsWith('http')) {
          candidates.push({ url: decoded, source: `param:${key}`, confidence: CONFIDENCE.param });
        }
      }
    }
  } catch (_) {
    // ignore
  }
  return candidates;
}

function extractCandidatesFromHtml(html, baseUrl) {
  const candidates = [];
  if (!html) return candidates;
  const text = html.toString('utf8');

  // Meta refresh (handle multiple tags, varied casing/spacing/quotes)
  const metaTags = text.match(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const contentMatch = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^'">\s]+))/i);
    const content = contentMatch?.[1] || contentMatch?.[2] || contentMatch?.[3];
    if (!content) continue;
    const parts = content.split(';').map((p) => p.trim()).filter(Boolean);
    const urlPart = parts.find((p) => /url\s*=/i.test(p));
    if (urlPart) {
      const raw = urlPart.replace(/url\s*=\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
      const resolved = resolveUrl(baseUrl, raw) || raw;
      if (resolved && resolved.startsWith('http')) {
        candidates.push({ url: resolved, source: 'meta_refresh', confidence: CONFIDENCE.meta_refresh });
      }
    }
  }

  // JS location assignments
  const jsRegex = /location\.(?:href|replace|assign)\s*=\s*["']([^"']+)["']/gi;
  let jsMatch;
  while ((jsMatch = jsRegex.exec(text)) !== null) {
    const resolved = resolveUrl(baseUrl, jsMatch[1]) || jsMatch[1];
    if (resolved.startsWith('http')) {
      candidates.push({ url: resolved, source: 'js_location', confidence: CONFIDENCE.js_location });
    }
  }

  // Generic URL harvest (top N to avoid noise)
  const genericUrlRegex = /(https?:\/\/[\w.-]+[^\s"'<>]*)/gi;
  const seen = new Set();
  let gMatch;
  while ((gMatch = genericUrlRegex.exec(text)) !== null && candidates.length < 8) {
    const candidate = gMatch[1];
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push({ url: candidate, source: 'generic_html', confidence: CONFIDENCE.generic_html });
    }
  }

  return candidates;
}

function bestHtmlCandidate(html, baseUrl) {
  const candidates = extractCandidatesFromHtml(html, baseUrl)
    .filter((c) => c.source === 'meta_refresh' || c.source === 'js_location');
  return pickBestCandidate(candidates);
}

async function verifyCandidate(url, opts) {
  const remaining = timeLeft(opts.started, opts.maxMs);
  if (remaining <= 0) return { verified: false, status: 'timeout' };
  const resolvedProxy = await resolveProxyUrl(opts);
  const agentCfg = buildAxiosAgents(resolvedProxy);
  let totalBytes = 0;
  try {
    const response = await axios({
      url,
      method: 'get',
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: Math.min(
        Math.round(opts.verifyTimeoutMs * (isSlowDomain(url) ? 2.0 : 1)),
        remaining,
      ),
      responseType: 'arraybuffer',
      ...agentCfg,
    });
    totalBytes += Buffer.byteLength(response.data || '');

    // If HTTP redirect, follow up to followHops
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      let next = resolveUrl(url, response.headers.location) || response.headers.location;
      let redirects = 0;
      const subchain = [{ url, status: response.status, location: next }];
      while (redirects < opts.followHops) {
        redirects += 1;
        const hopResp = await axios({
          url: next,
          method: 'get',
          maxRedirects: 0,
          validateStatus: () => true,
          timeout: Math.min(
            Math.round(opts.verifyTimeoutMs * (isSlowDomain(next) ? 2.0 : 1)),
            timeLeft(opts.started, opts.maxMs),
          ),
          responseType: 'arraybuffer',
          ...agentCfg,
        });
        totalBytes += Buffer.byteLength(hopResp.data || '');
        const loc = hopResp.headers.location ? resolveUrl(next, hopResp.headers.location) || hopResp.headers.location : null;
        subchain.push({ url: next, status: hopResp.status, location: loc });
        if (hopResp.status >= 300 && hopResp.status < 400 && loc) {
          next = loc;
          continue;
        }

        // Try meta/js from HTML body if present
        const metaCandidate = hopResp.headers['content-type']?.includes('text/html')
          ? bestHtmlCandidate(hopResp.data, next)
          : null;
        if (metaCandidate && metaCandidate.url) {
          next = metaCandidate.url;
          subchain[subchain.length - 1].metaCandidate = metaCandidate.url;
          continue;
        }
        return { verified: true, status: hopResp.status, finalUrl: loc || next, subchain };
      }
      return { verified: true, status: response.status, finalUrl: next, subchain };
    }

    // Not an HTTP redirect: check meta/js to decide next hop (allow limited recursion)
    const subchain = [{ url, status: response.status }];
    let nextUrl = url;
    let hops = 0;

    while (hops < opts.followHops && response.headers['content-type']?.includes('text/html')) {
      const candidate = bestHtmlCandidate(response.data, nextUrl);
      if (!candidate || !candidate.url) break;
      subchain[subchain.length - 1].metaCandidate = candidate.url;

      // Follow the candidate
      nextUrl = candidate.url;
      hops += 1;
      const remainingInner = Math.min(opts.verifyTimeoutMs, timeLeft(opts.started, opts.maxMs));
      if (remainingInner <= 0) break;

      const hopResp = await axios({
        url: nextUrl,
        method: 'get',
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: Math.round(remainingInner * (isSlowDomain(nextUrl) ? 1.6 : 1)),
        responseType: 'arraybuffer',
        ...agentCfg,
      });
      totalBytes += Buffer.byteLength(hopResp.data || '');

      const loc = hopResp.headers.location ? resolveUrl(nextUrl, hopResp.headers.location) || hopResp.headers.location : null;
      subchain.push({ url: nextUrl, status: hopResp.status, location: loc });

      // If redirect, continue loop to follow redirect chain via next iteration
      if (hopResp.status >= 300 && hopResp.status < 400 && loc) {
        nextUrl = loc;
        response = hopResp;
        continue;
      }

      // If HTML, continue to inspect for another meta/js
      if (hopResp.headers['content-type']?.includes('text/html')) {
        response = hopResp;
        continue;
      }

      // Non-HTML terminal
      return { verified: true, status: hopResp.status, finalUrl: loc || nextUrl, subchain, bandwidth_bytes: totalBytes };
    }

    return { verified: true, status: response.status, finalUrl: nextUrl, subchain, bandwidth_bytes: totalBytes };
  } catch (error) {
    return { verified: false, status: 'error', error: error.message };
  }
}

async function traceUniversal(initialUrl, userOptions = {}) {
  const opts = { ...DEFAULTS, ...userOptions, started: now() };

  const phaseNotes = [];

  // Phase 1: HTTP hop expansion
  const httpResult = await httpHopChain(initialUrl, opts);
  const last = httpResult.finalResponse;
  phaseNotes.push('phase1:http');

  // Phase 2: static extraction
  const staticCandidates = [
    ...extractCandidatesFromUrl(last?.url || initialUrl),
    ...extractCandidatesFromHtml(last?.body, last?.url || initialUrl),
  ];

  // If no finalResponse but we saw a Location in the last hop, add it as a candidate to follow
  if (!last && httpResult.chain.length > 0) {
    const lastHop = httpResult.chain[httpResult.chain.length - 1];
    if (lastHop.location) {
      const locUrl = resolveUrl(lastHop.url, lastHop.location) || lastHop.location;
      if (locUrl.startsWith('http')) {
        staticCandidates.push({ url: locUrl, source: 'http_location', confidence: 0.65 });
      }
    }
  }
  phaseNotes.push(`phase2:candidates=${staticCandidates.length}`);

  let chosen = pickBestCandidate(staticCandidates);

  // Phase 3: quick verify of chosen candidate
  let verified = null;
  if (chosen) {
    verified = await verifyCandidate(chosen.url, opts);
    if (verified?.verified && verified.finalUrl) {
      chosen = { ...chosen, url: verified.finalUrl, verified: true, verifyStatus: verified.status };
      if (verified.subchain) {
        chosen.subchain = verified.subchain;
      }
      if (verified.bandwidth_bytes != null) {
        chosen.bandwidth_bytes = verified.bandwidth_bytes;
      }
      phaseNotes.push('phase3:verified');
    } else {
      phaseNotes.push('phase3:verify_failed');
    }
  }

  const duration = now() - opts.started;
  let finalUrl = (chosen && chosen.url) || (last && last.url);
  if (!finalUrl && httpResult.chain.length > 0) {
    const lastHop = httpResult.chain[httpResult.chain.length - 1];
    finalUrl = lastHop.location || lastHop.url || initialUrl;
  }
  if (!finalUrl) finalUrl = initialUrl;
  const totalBandwidth = (httpResult.bandwidth_bytes || 0) + (chosen?.bandwidth_bytes || 0);

  return {
    success: true,
    duration_ms: duration,
    initial_url: initialUrl,
    resolved_url: finalUrl,
    http_chain: httpResult.chain,
    final_response: last ? { url: last.url, status: last.status, contentType: last.contentType } : null,
    candidate: chosen,
    notes: phaseNotes,
    total_bandwidth_bytes: totalBandwidth,
    targetCountry: opts.targetCountry || null,
  };
}

function printResult(result) {
  console.log(`${'='.repeat(80)}`);
  console.log('Universal Tracer (standalone prototype)');
  console.log(`${'='.repeat(80)}`);
  console.log(`Initial: ${result.initial_url}`);
  console.log(`Resolved: ${result.resolved_url}`);
  console.log(`Duration: ${result.duration_ms} ms`);
  if (result.total_bandwidth_bytes != null) {
    console.log(`Bandwidth: ${result.total_bandwidth_bytes} bytes`);
  }
  if (result.targetCountry) {
    console.log(`Geo-targeting: ${result.targetCountry}`);
  }
  console.log(`Notes: ${result.notes.join(', ')}`);
  console.log(`Chain:`);
  result.http_chain.forEach((step, i) => {
    const extra = step.location ? '-> ' + step.location : '';
    const err = step.error ? ` (error: ${step.error})` : '';
    console.log(`  ${i + 1}. [${step.status}] ${step.url} ${extra}${err}`);
  });
  if (result.candidate) {
    console.log('Candidate:');
    console.log(`  url: ${result.candidate.url}`);
    console.log(`  source: ${result.candidate.source}`);
    console.log(`  confidence: ${result.candidate.confidence}`);
    if (result.candidate.verifyStatus) {
      console.log(`  verify: ${result.candidate.verifyStatus}`);
    }
    if (result.candidate.subchain) {
      console.log('  subchain:');
      result.candidate.subchain.forEach((s, idx) => {
        const loc = s.location ? '-> ' + s.location : '';
        const meta = s.metaCandidate ? ` (meta/js-> ${s.metaCandidate})` : '';
        console.log(`    ${idx + 1}. [${s.status}] ${s.url} ${loc}${meta}`);
      });
    }
  }
  console.log(`${'='.repeat(80)}`);
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node universal-tracer.js <url> [maxMs] [--proxy=<url>] [--country=<code>]');
    process.exit(1);
  }
  const maxMs = process.argv[3] && !process.argv[3].startsWith('--') ? parseInt(process.argv[3], 10) : DEFAULTS.maxMs;
  const proxyArg = process.argv.find((a) => a.startsWith('--proxy='));
  const proxyUrl = proxyArg ? proxyArg.replace('--proxy=', '') : DEFAULTS.proxyUrl;
  const countryArg = process.argv.find((a) => a.startsWith('--country='));
  const targetCountry = countryArg ? countryArg.replace('--country=', '').toUpperCase() : null;
  traceUniversal(target, { maxMs, proxyUrl, targetCountry }).then((res) => {
    printResult(res);
    process.exit(0);
  }).catch((err) => {
    console.error('Trace failed:', err.message);
    process.exit(1);
  });
}
