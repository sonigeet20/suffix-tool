#!/usr/bin/env node
/*
  HTML Lite Redirect Tracer (Proxy-aware)
  - Fast, header-only tracing (HEAD, with GET+Range fallback)
  - Optional proxy via env PROXY or LUNA_PROXY_URL or --proxy
  - Outputs a minimal HTML with hop details and timings

  Usage:
    PROXY="http://user:pass@host:port" node scripts/html_lite_trace.js \
      --url "https://example.com" --maxHops 10 --out "/tmp/trace.html"

  Defaults:
    --maxHops 10, --requestTimeout 1500
*/

const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const got = require('got').default || require('got');
const { HttpsProxyAgent } = require('https-proxy-agent');
const tough = require('tough-cookie');

function parseArgs(argv) {
  const args = { url: '', maxHops: 10, out: '', proxy: '', requestTimeout: 1500, ua: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--url' || a === '-u') { args.url = next; i++; }
    else if (a === '--maxHops' || a === '-n') { args.maxHops = parseInt(next, 10) || 10; i++; }
    else if (a === '--out' || a === '-o') { args.out = next; i++; }
    else if (a === '--proxy' || a === '-p') { args.proxy = next; i++; }
    else if (a === '--requestTimeout') { args.requestTimeout = parseInt(next, 10) || 1500; i++; }
    else if (a === '--ua') { args.ua = next; i++; }
  }
  args.proxy = args.proxy || process.env.PROXY || process.env.LUNA_PROXY_URL || '';
  args.ua = args.ua || process.env.UA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  if (!args.url) {
    console.error('Error: --url is required');
    process.exit(1);
  }
  return args;
}

function isRedirectStatus(code) {
  return code >= 300 && code < 400;
}

function resolveLocation(currentUrl, location) {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return location || '';
  }
}

async function fetchHeadersOnly(url, options) {
  const start = Date.now();
  const res = await got(url, {
    method: 'HEAD',
    followRedirect: false,
    timeout: { request: options.requestTimeout },
    retry: { limit: 0 },
    throwHttpErrors: false,
    agent: options.agent,
    headers: options.headers,
    cookieJar: options.cookieJar,
  });
  return { ms: Date.now() - start, statusCode: res.statusCode, location: res.headers.location || '' };
}

async function fetchMinimalGet(url, options) {
  const start = Date.now();
  const res = await got(url, {
    method: 'GET',
    followRedirect: false,
    timeout: { request: options.requestTimeout },
    retry: { limit: 0 },
    throwHttpErrors: false,
    agent: options.agent,
    headers: { ...(options.headers || {}), 'Range': 'bytes=0-0', 'Accept-Encoding': 'identity' },
    cookieJar: options.cookieJar,
  });
  return { ms: Date.now() - start, statusCode: res.statusCode, location: res.headers.location || '' };
}

async function fetchPlainGetForRedirect(url, options) {
  const start = Date.now();
  const res = await got(url, {
    method: 'GET',
    followRedirect: false,
    timeout: { request: options.requestTimeout },
    retry: { limit: 0 },
    throwHttpErrors: false,
    agent: options.agent,
    headers: { ...(options.headers || {}), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    cookieJar: options.cookieJar,
  });
  return { ms: Date.now() - start, statusCode: res.statusCode, location: res.headers.location || '' };
}

async function fetchLightBody(url, options, bytes = 16384) {
  const start = Date.now();
  const res = await got(url, {
    method: 'GET',
    followRedirect: false,
    timeout: { request: options.requestTimeout },
    retry: { limit: 0 },
    throwHttpErrors: false,
    agent: options.agent,
    headers: { ...(options.headers || {}), 'Range': `bytes=0-${bytes-1}`, 'Accept-Encoding': 'identity', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    cookieJar: options.cookieJar,
  });
  const html = res.body || '';
  const refreshHeader = res.headers.refresh || res.headers['Refresh'];
  let next = '';
  if (refreshHeader) {
    const m = /url=([^;\s]+)\s*/i.exec(refreshHeader);
    if (m) next = m[1];
  }
  if (!next) {
    next = parseMetaRefresh(html) || parseJsInlineRedirect(html) || '';
  }
  // Heuristic: if still no next, attempt to fetch first external script and scan for redirect
  if (!next) {
    const scriptSrcs = extractScriptSrcs(html, 3);
    for (const src of scriptSrcs) {
      try {
        const scriptUrl = new URL(src, url).toString();
        const scriptRes = await got(scriptUrl, {
          method: 'GET',
          followRedirect: false,
          timeout: { request: options.requestTimeout },
          retry: { limit: 0 },
          throwHttpErrors: false,
          agent: options.agent,
          headers: { ...(options.headers || {}), 'Accept': 'application/javascript,text/javascript;q=0.9,*/*;q=0.8' },
          cookieJar: options.cookieJar,
        });
        const jsBody = scriptRes.body || '';
        const jsNext = parseJsInlineRedirect(jsBody);
        if (jsNext) { next = jsNext; break; }
      } catch (e) {
        // ignore script fetch errors
      }
    }
  }
  return { ms: Date.now() - start, statusCode: res.statusCode, location: next };
}

function parseMetaRefresh(html) {
  const m = /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>]+)["'][^>]*>/i.exec(html);
  return m ? m[1] : '';
}

function parseJsInlineRedirect(html) {
  // Enhanced patterns for JS-based redirects
  const patterns = [
    // Direct location assignments
    /location\s*=\s*["'](https?:[^"']+)["']/i,
    /location\.href\s*=\s*["'](https?:[^"']+)["']/i,
    /window\.location\s*=\s*["'](https?:[^"']+)["']/i,
    /window\.location\.href\s*=\s*["'](https?:[^"']+)["']/i,
    /location\.replace\(\s*["'](https?:[^"']+)["']\s*\)/i,
    /document\.location\s*=\s*["'](https?:[^"']+)["']/i,
    /top\.location\s*=\s*["'](https?:[^"']+)["']/i,
    /window\.open\(\s*["'](https?:[^"']+)["']\s*,\s*["']?_self["']?\s*\)/i,
    /location\.assign\(\s*["'](https?:[^"']+)["']\s*\)/i,
    
    // JSON-like data with urls or paths (common in affiliate flows)
    /['"]((?:https?:)?\/\/[^"']+)['"]/i,
    
    // Common affiliate variables passed to redirects
    /var\s+\w+\s*=\s*["'](https?:[^"']+)["']/i,
  ];
  
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      const url = m[1];
      // Verify it looks like a URL
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
        return url;
      }
    }
  }
  return '';
}

function extractScriptSrcs(html, max = 3) {
  const srcs = [];
  const re = /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/ig;
  let m;
  while ((m = re.exec(html)) && srcs.length < max) {
    srcs.push(m[1]);
  }
  return srcs;
}

async function traceRedirects(url, opts) {
  const hops = [];
  let current = url;
  const jar = new tough.CookieJar();
  const baseHeaders = {
    'User-Agent': opts.ua,
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Pragma': 'no-cache',
  };
  for (let i = 1; i <= opts.maxHops; i++) {
    const headers = { ...baseHeaders, ...(opts.headers || {}), Referer: i > 1 ? hops[i-2].url : undefined };
    let r = await fetchHeadersOnly(current, { ...opts, headers, cookieJar: jar }).catch(() => null);
    // Fallback to GET minimal when HEAD not supported, 404, or missing Location on 30x
    if (!r || r.statusCode === 405 || r.statusCode === 501 || r.statusCode === 404 || (isRedirectStatus(r.statusCode) && !r.location)) {
      r = await fetchMinimalGet(current, { ...opts, headers, cookieJar: jar }).catch(() => null);
    }
    // If still 404 or no Location, try plain GET without Range (some servers don't handle Range or 404 on partial)
    if (r && (r.statusCode === 404 || (!r.location && (r.statusCode >= 200 && r.statusCode < 400)))) {
      const plain = await fetchPlainGetForRedirect(current, { ...opts, headers, cookieJar: jar }).catch(() => null);
      if (plain) {
        if (plain.statusCode >= 300 && plain.statusCode < 400 && plain.location) {
          r = { ms: r.ms + plain.ms, statusCode: plain.statusCode, location: plain.location };
        } else if (plain.statusCode >= 200 && plain.statusCode < 300 && !r.location) {
          r = { ms: r.ms + plain.ms, statusCode: plain.statusCode, location: '' };
        }
      }
    }
    // If still no Location and status is 2xx/3xx, try light body to detect meta refresh or JS redirect
    if (r && !r.location && (r.statusCode >= 200 && r.statusCode < 400)) {
      const bodyRes = await fetchLightBody(current, { ...opts, headers, cookieJar: jar }).catch(() => null);
      if (bodyRes && bodyRes.location) {
        // Treat detected meta refresh or JS redirect as a hop (synthetic redirect)
        r = { ms: r.ms + bodyRes.ms, statusCode: isRedirectStatus(r.statusCode) ? r.statusCode : 302, location: bodyRes.location };
      }
    }
    if (!r) {
      hops.push({ hop: i, url: current, status: `error (timeout: ${opts.requestTimeout}ms)`, ms: opts.requestTimeout, location: '' });
      break;
    }
    const nextUrl = isRedirectStatus(r.statusCode) && r.location ? resolveLocation(current, r.location) : '';
    hops.push({ hop: i, url: current, status: r.statusCode, ms: r.ms, location: nextUrl });
    if (!nextUrl) break;
    current = nextUrl;
  }
  return hops;
}

function renderHtmlLite(hops) {
  const rows = hops.map(h => `
    <tr>
      <td>${h.hop}</td>
      <td><a href="${escapeHtml(h.url)}" target="_blank">${escapeHtml(h.url)}</a></td>
      <td>${h.status}</td>
      <td>${h.ms} ms</td>
      <td>${h.location ? `<a href="${escapeHtml(h.location)}" target="_blank">${escapeHtml(h.location)}</a>` : ''}</td>
    </tr>`).join('');
  const totalMs = hops.reduce((s, h) => s + (h.ms || 0), 0);
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HTML Lite Trace</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;padding:16px;background:#fafafa;color:#111}
  h1{font-size:20px;margin:0 0 8px}
  .summary{margin:8px 0 16px;color:#333}
  table{border-collapse:collapse;width:100%;background:#fff}
  th,td{border:1px solid #ddd;padding:8px;font-size:13px}
  th{background:#f2f2f2;text-align:left}
  a{color:#0645ad;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
<h1>HTML Lite Redirect Trace</h1>
<div class="summary">Hops: ${hops.length} • Total: ${totalMs} ms</div>
<table>
  <thead>
    <tr><th>#</th><th>URL</th><th>Status</th><th>Time</th><th>Location</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

(async function main(){
  const args = parseArgs(process.argv);
  const agent = args.proxy ? { https: new HttpsProxyAgent(args.proxy), http: new HttpsProxyAgent(args.proxy) } : undefined;
  const opts = { maxHops: args.maxHops, agent, requestTimeout: args.requestTimeout };
  const start = Date.now();
  const hops = await traceRedirects(args.url, opts);
  const totalMs = Date.now() - start;
  const html = renderHtmlLite(hops);
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, html, 'utf8');
    console.log(`HTML written: ${args.out}`);
  } else {
    console.log(html);
  }
  console.log(`Summary: hops=${hops.length}, total=${totalMs}ms, avg=${Math.round(totalMs/Math.max(1,hops.length))}ms/hop`);
})();
