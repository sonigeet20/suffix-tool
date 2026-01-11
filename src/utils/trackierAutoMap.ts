/**
 * Trackier Auto-Mapping Utility
 * Automatically detects parameters in URLs and intelligently maps them to p1-p10 slots
 */

// Priority mapping for common parameters (order matters - earlier = higher priority)
const PARAMETER_PRIORITY: Record<string, number> = {
  gclid: 1,      // Google Ads (most common)
  fbclid: 2,     // Facebook
  msclkid: 3,    // Microsoft Ads
  ttclid: 4,     // TikTok
  clickid: 5,    // Generic click ID
  click_id: 6,   // Alternative click ID
  utm_source: 7,
  utm_medium: 8,
  utm_campaign: 9,
  utm_content: 10,
  utm_term: 11,
  publisher_id: 12,
  affiliate_id: 13,
  partner_id: 14,
  ref: 15,
  referrer: 16,
  source: 17,
};

interface DetectedParameter {
  name: string;
  examples: string[];
  priority: number;
  count: number;
}

interface AutoMapResult {
  mapping: Record<string, string>;
  detectedParams: DetectedParameter[];
  unmappedParams: string[];
  totalParams: number;
}

/**
 * Extract all parameters from a URL
 */
export function extractParametersFromUrl(url: string): Map<string, string[]> {
  const params = new Map<string, string[]>();

  try {
    // Handle both full URLs and query strings
    let queryString = url;
    if (url.includes('?')) {
      queryString = url.split('?')[1];
    }

    if (!queryString) return params;

    // Split by & and parse each parameter
    queryString.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key) {
        const decodedKey = decodeURIComponent(key);
        const decodedValue = decodeURIComponent(value || '');

        if (!params.has(decodedKey)) {
          params.set(decodedKey, []);
        }
        params.get(decodedKey)!.push(decodedValue);
      }
    });
  } catch (error) {
    console.error('Error parsing URL:', error);
  }

  return params;
}

/**
 * Automatically detect and map parameters from URLs
 * Intelligently assigns parameters to p1-p10 based on common patterns
 */
export function autoMapParameters(
  extractionUrl?: string,
  finalUrl?: string,
  suffixPattern?: string
): AutoMapResult {
  const allParams = new Map<string, DetectedParameter>();
  const paramOrder: string[] = [];

  // Collect parameters from all sources
  const urlsToCheck = [extractionUrl, finalUrl, suffixPattern].filter(Boolean);

  urlsToCheck.forEach((url) => {
    const extracted = extractParametersFromUrl(url || '');
    extracted.forEach((values, name) => {
      const lowerName = name.toLowerCase();
      const priority = PARAMETER_PRIORITY[lowerName] ?? 1000;

      if (!allParams.has(lowerName)) {
        allParams.set(lowerName, {
          name: lowerName,
          examples: [],
          priority,
          count: 0,
        });
        paramOrder.push(lowerName);
      }

      const param = allParams.get(lowerName)!;
      param.count++;
      param.examples.push(...values.slice(0, 2)); // Keep first 2 examples
    });
  });

  // Sort by priority (lower number = higher priority)
  const sortedParams = Array.from(allParams.values())
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10); // Max 10 parameters

  // Map to p1-p10
  const mapping: Record<string, string> = {};
  sortedParams.forEach((param, index) => {
    const pSlot = `p${index + 1}`;
    mapping[pSlot] = param.name;
  });

  // Identify unmapped parameters
  const mappedNames = sortedParams.map((p) => p.name);
  const unmappedParams = Array.from(allParams.keys()).filter(
    (name) => !mappedNames.includes(name)
  );

  return {
    mapping,
    detectedParams: sortedParams,
    unmappedParams,
    totalParams: allParams.size,
  };
}

/**
 * Build a human-readable summary of the auto-map result
 */
export function formatAutoMapSummary(result: AutoMapResult): string {
  if (result.detectedParams.length === 0) {
    return 'No parameters found in provided URLs';
  }

  const lines: string[] = [
    `✅ Detected ${result.totalParams} unique parameters`,
    `📍 Mapped ${result.detectedParams.length} to p1-p10:`,
    '',
  ];

  result.detectedParams.forEach((param, index) => {
    const pSlot = `p${index + 1}`;
    const example =
      param.examples.length > 0
        ? ` (e.g. "${param.examples[0].substring(0, 20)}${param.examples[0].length > 20 ? '...' : ''}")`
        : '';
    lines.push(`  ${pSlot}: ${param.name}${example}`);
  });

  if (result.unmappedParams.length > 0) {
    lines.push('');
    lines.push(`⚠️  Additional parameters (not mapped to p1-p10):`);
    result.unmappedParams.slice(0, 5).forEach((param) => {
      lines.push(`  • ${param}`);
    });
    if (result.unmappedParams.length > 5) {
      lines.push(`  • +${result.unmappedParams.length - 5} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Validate if a parameter name is reasonable
 */
export function isValidParameterName(name: string): boolean {
  // Avoid common false positives
  const excluded = [
    'utm_id',
    'gad_source',
    'fbp',
    'fbc',
    'v',
    'tid',
    'z',
    'cid',
    'ec',
    'ea',
    'el',
  ];

  const lowerName = name.toLowerCase();
  return (
    name.length > 0 &&
    name.length < 50 &&
    !excluded.includes(lowerName) &&
    !/^[0-9]+$/.test(lowerName) // Skip purely numeric names
  );
}
