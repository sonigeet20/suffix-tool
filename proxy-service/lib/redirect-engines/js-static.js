/**
 * JavaScript Static Analysis Redirect Detection Engine
 * Detects JS-based redirects via regex patterns (no execution)
 */

function detectRedirect(html, currentUrl) {
  if (!html || typeof html !== 'string') return null;
  
  // Priority patterns for affiliate/cloaking systems
  const patterns = [
    // Direct location assignments (most common)
    { re: /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i, type: 'js_location' },
    { re: /location\.replace\(\s*["']([^"']+)["']\s*\)/i, type: 'js_replace' },
    { re: /location\.assign\(\s*["']([^"']+)["']\s*\)/i, type: 'js_assign' },
    
    // Document/top/parent locations
    { re: /document\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i, type: 'js_document_location' },
    { re: /top\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i, type: 'js_top_location' },
    { re: /parent\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i, type: 'js_parent_location' },
    
    // Affiliate-specific variable patterns (look for common redirect var names)
    { re: /(?:var|let|const)\s+(?:redirectUrl|nextUrl|targetUrl|affUrl|destination)\s*=\s*["']([^"']+)["']/i, type: 'js_variable' },
    
    // Window.open with _self (acts as redirect)
    { re: /window\.open\(\s*["']([^"']+)["']\s*,\s*["']?_self["']?\s*\)/i, type: 'js_window_open' },
    
    // SetTimeout with location (delayed redirect)
    { re: /setTimeout\([^)]*location(?:\.href)?\s*=\s*["']([^"']+)["'][^)]*\)/i, type: 'js_settimeout' }
  ];
  
  // Try patterns in order of priority
  for (const { re, type } of patterns) {
    const match = re.exec(html);
    if (match && match[1]) {
      const url = match[1];
      // Validate it looks like a URL
      if (isValidUrl(url)) {
        return {
          type,
          url: resolveUrl(url, currentUrl),
          confidence: 'high'
        };
      }
    }
  }
  
  // Fallback: look for any quoted URL string that might be a redirect target
  // This catches cases where the URL is in a data attribute or inline script
  const urlPattern = /["'](https?:\/\/[^"'\s]{10,})["']/g;
  const urls = [];
  let urlMatch;
  
  while ((urlMatch = urlPattern.exec(html)) && urls.length < 5) {
    const url = urlMatch[1];
    if (isValidUrl(url) && !url.includes('cdn.') && !url.includes('static.') && !url.includes('.css') && !url.includes('.js')) {
      urls.push(url);
    }
  }
  
  // Return first non-CDN URL as potential redirect (low confidence)
  if (urls.length > 0) {
    return {
      type: 'js_generic_url',
      url: urls[0],
      confidence: 'low'
    };
  }
  
  return null;
}

function isValidUrl(url) {
  return /^https?:\/\/[^\s<>"]+$/.test(url) && url.length > 10;
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

module.exports = { detectRedirect };
