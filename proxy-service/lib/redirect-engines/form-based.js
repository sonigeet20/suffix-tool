/**
 * Form-Based Redirect Detection Engine
 * Detects hidden forms with redirect actions
 */

function detectRedirect(html, currentUrl) {
  if (!html || typeof html !== 'string') return null;
  
  // Look for forms with action attributes that might redirect
  const formPattern = /<form[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/gi;
  let match;
  
  while ((match = formPattern.exec(html))) {
    const action = match[1];
    const formContent = match[2];
    
    // Check if form is likely a redirect form (hidden inputs, auto-submit script, etc.)
    const hasHiddenInputs = /<input[^>]*type=["']?hidden["']?[^>]*>/i.test(formContent);
    const hasAutoSubmit = /form\.submit\(\)|\.submit\(\)/i.test(html);
    const hasSubmitButton = /<button[^>]*type=["']?submit["']?[^>]*>|<input[^>]*type=["']?submit["']?[^>]*>/i.test(formContent);
    
    if ((hasHiddenInputs && hasAutoSubmit) || (hasHiddenInputs && !hasSubmitButton)) {
      return {
        type: 'form_redirect',
        url: resolveUrl(action, currentUrl),
        confidence: 'medium',
        method: getFormMethod(match[0])
      };
    }
  }
  
  return null;
}

function getFormMethod(formTag) {
  const methodMatch = /method=["']?(get|post)["']?/i.exec(formTag);
  return methodMatch ? methodMatch[1].toUpperCase() : 'GET';
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

module.exports = { detectRedirect };
