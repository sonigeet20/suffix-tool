/**
 * Meta Refresh Redirect Detection Engine
 * Detects HTML meta refresh and http-equiv redirects
 */

function detectRedirect(html, currentUrl) {
  if (!html || typeof html !== 'string') return null;
  
  // Meta http-equiv="refresh"
  const metaRefreshPattern = /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']([^"']+)["'][^>]*>/i;
  const match = metaRefreshPattern.exec(html);
  
  if (match) {
    const content = match[1];
    const urlMatch = /url=([^;\s"']+)/i.exec(content);
    if (urlMatch) {
      return {
        type: 'meta_refresh',
        url: resolveUrl(urlMatch[1], currentUrl),
        confidence: 'high'
      };
    }
  }
  
  // CSP redirect (less common)
  const cspPattern = /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*content=["']([^"']+)["'][^>]*>/i;
  const cspMatch = cspPattern.exec(html);
  
  if (cspMatch) {
    const content = cspMatch[1];
    const urlMatch = /navigate-to\s+([^;\s"']+)/i.exec(content);
    if (urlMatch) {
      return {
        type: 'csp_redirect',
        url: resolveUrl(urlMatch[1], currentUrl),
        confidence: 'medium'
      };
    }
  }
  
  return null;
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

module.exports = { detectRedirect };
