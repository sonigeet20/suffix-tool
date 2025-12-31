/**
 * HTTP Headers Redirect Detection Engine
 * Detects 30x Location, Refresh, and custom redirect headers
 */

function detectRedirect(res, currentUrl) {
  const { statusCode, headers } = res;
  
  // Standard Location header (30x)
  if (statusCode >= 300 && statusCode < 400 && headers.location) {
    return {
      type: 'http_location',
      url: resolveUrl(headers.location, currentUrl),
      confidence: 'high',
      statusCode
    };
  }
  
  // Refresh header
  if (headers.refresh || headers['Refresh']) {
    const refreshHeader = headers.refresh || headers['Refresh'];
    const match = /url=([^;\s]+)/i.exec(refreshHeader);
    if (match) {
      return {
        type: 'http_refresh',
        url: resolveUrl(match[1], currentUrl),
        confidence: 'high',
        statusCode
      };
    }
  }
  
  // Custom redirect headers
  const customHeaders = ['x-redirect', 'x-original-url', 'x-location'];
  for (const header of customHeaders) {
    if (headers[header]) {
      return {
        type: 'http_custom',
        url: resolveUrl(headers[header], currentUrl),
        confidence: 'medium',
        statusCode
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
