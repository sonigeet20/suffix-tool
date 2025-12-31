#!/usr/bin/env node
/**
 * Robust Redirect Tracer CLI
 * Anti-cloaking tracer with geo-targeting, UA rotation, and multi-engine detection
 */

const RobustTracer = require('../lib/robust-tracer');
const GeoRouting = require('../lib/geo-routing');
const UARotation = require('../lib/ua-rotation');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    url: '',
    geo: 'us',
    proxyProvider: null,
    proxyCreds: null,
    uaProfile: 'desktop',
    timeout: 3000,
    maxHops: 20,
    out: null,
    browserFallback: false,
    verbose: false
  };
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    
    if (arg === '--url' && next) { args.url = next; i++; }
    else if (arg === '--geo' && next) { args.geo = next; i++; }
    else if (arg === '--proxy-provider' && next) { args.proxyProvider = next; i++; }
    else if (arg === '--proxy-creds' && next) { args.proxyCreds = next; i++; }
    else if (arg === '--ua-profile' && next) { args.uaProfile = next; i++; }
    else if (arg === '--timeout' && next) { args.timeout = parseInt(next, 10); i++; }
    else if (arg === '--maxHops' && next) { args.maxHops = parseInt(next, 10); i++; }
    else if (arg === '--out' && next) { args.out = next; i++; }
    else if (arg === '--browser-fallback') { args.browserFallback = true; }
    else if (arg === '--verbose') { args.verbose = true; }
  }
  
  // Env fallbacks
  args.proxyCreds = args.proxyCreds || process.env.PROXY || process.env.LUNA_PROXY_URL;
  
  if (!args.url) {
    console.error('Error: --url is required');
    console.error('Usage: node robust-trace.js --url <url> [options]');
    process.exit(1);
  }
  
  return args;
}

function renderHtml(result) {
  const rows = result.chain.map(h => `
    <tr>
      <td>${h.hop}</td>
      <td><a href="${escapeHtml(h.url)}" target="_blank">${escapeHtml(h.url)}</a></td>
      <td>${h.status}</td>
      <td>${h.redirectType || 'none'}</td>
      <td>${h.detectedBy || '-'}</td>
      <td>${h.confidence || '-'}</td>
      <td>${h.ms} ms</td>
      <td>${h.location ? `<a href="${escapeHtml(h.location)}" target="_blank">${escapeHtml(h.location)}</a>` : '-'}</td>
    </tr>`).join('');
  
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Robust Redirect Trace</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;padding:16px;background:#fafafa;color:#111}
  h1{font-size:20px;margin:0 0 8px}
  .summary{margin:8px 0 16px;color:#333}
  .meta{margin:8px 0 16px;font-size:13px;color:#666}
  table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px}
  th{background:#f2f2f2;text-align:left}
  a{color:#0645ad;text-decoration:none}
  a:hover{text-decoration:underline}
  .high{color:#0a0}
  .medium{color:#f90}
  .low{color:#999}
</style>
<h1>Robust Redirect Trace (Anti-Cloaking)</h1>
<div class="summary">Hops: ${result.chain.length} • Total: ${result.totalMs} ms • Success: ${result.success ? 'Yes' : 'No'}</div>
<div class="meta">Geo: ${result.geo} • Final: <a href="${escapeHtml(result.finalUrl)}" target="_blank">${escapeHtml(result.finalUrl)}</a></div>
<table>
  <thead>
    <tr><th>#</th><th>URL</th><th>Status</th><th>Type</th><th>Engine</th><th>Confidence</th><th>Time</th><th>Next</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

(async function main() {
  const args = parseArgs(process.argv);
  
  // Setup geo routing
  const geoRouting = args.proxyCreds && args.proxyProvider
    ? new GeoRouting(args.proxyProvider, args.proxyCreds, args.geo)
    : null;
  
  // Setup UA rotation
  const uaRotation = new UARotation(args.uaProfile, args.geo, 'random');
  
  // Create tracer
  const tracer = new RobustTracer({
    geoRouting,
    uaRotation,
    maxHops: args.maxHops,
    timeout: args.timeout,
    verbose: args.verbose,
    browserFallback: args.browserFallback
  });
  
  // Trace
  console.log(`Tracing: ${args.url} (geo=${args.geo})`);
  const result = await tracer.trace(args.url, args.geo);
  
  // Output
  if (args.out) {
    const ext = path.extname(args.out).toLowerCase();
    const content = ext === '.json' ? JSON.stringify(result, null, 2) : renderHtml(result);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, content, 'utf8');
    console.log(`Written: ${args.out}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  
  console.log(`Summary: hops=${result.chain.length}, total=${result.totalMs}ms, success=${result.success}`);
})();
