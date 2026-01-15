/**
 * Proxy Providers Handler - Integration Guide & Examples
 * 
 * How to use the new modular proxy provider handlers in your code
 */

// ===================================================================
// EXAMPLE 1: Simple Provider Selection (Recommended Starting Point)
// ===================================================================

const { getProxyProviderForOffer } = require('./lib/proxy-providers-handler');

async function traceWithAutoProvider(url, supabase, userId, offerId = null) {
  try {
    // Let the system decide which provider to use
    const provider = await getProxyProviderForOffer(supabase, userId, offerId, 'luna');
    
    console.log(`📌 Selected provider: ${provider.name} (${provider.provider_type})`);
    
    // Use provider configuration (don't modify essential trace functions)
    if (provider.provider_type === 'brightdata_browser') {
      // Optional: Use new handler or keep existing logic
      return await traceRedirectsBrightDataBrowser(url, {
        apiKey: provider.api_key,
        userContext: { user_id: userId, provider_id: provider.id },
      });
    } else {
      // Luna or other provider
      return await traceRedirectsBrowser(url, {
        proxyHost: provider.host,
        proxyPort: provider.port,
        proxyUsername: provider.username,
        proxyPassword: provider.password,
      });
    }
  } catch (error) {
    logger.error('Error in auto provider trace:', error);
    throw error;
  }
}

// ===================================================================
// EXAMPLE 2: Full Provider Routing with Handlers (Advanced)
// ===================================================================

const {
  routeToProxyProvider,
  handleLunaProxy,
  handleBrightDataBrowserProxy,
} = require('./lib/proxy-providers-handler');

async function traceWithFullRouting(url, supabase, userId, offerId = null) {
  try {
    // Route to appropriate handler based on provider
    const result = await routeToProxyProvider(
      url,
      supabase,
      userId,
      offerId,
      {
        maxRedirects: 20,
        timeout: 90000,
        userAgent: 'Mozilla/5.0...',
      },
      {
        // Provide tracer functions for each provider type
        lunaTracer: async (url, options) => traceRedirectsBrowser(url, options),
        brightDataTracer: async (url, options) => traceRedirectsBrightDataBrowser(url, options),
        defaultProvider: 'luna', // Luna is default if no override
      }
    );
    
    return result;
  } catch (error) {
    logger.error('Error in full routing trace:', error);
    throw error;
  }
}

// ===================================================================
// EXAMPLE 3: Explicit Provider Selection (Manual Control)
// ===================================================================

const {
  selectBrightDataBrowserProvider,
  loadLunaFromSettings,
  handleBrightDataBrowserProxy,
  handleLunaProxy,
} = require('./lib/proxy-providers-handler');

async function traceWithExplicitProvider(url, supabase, userId, providerType = 'luna') {
  try {
    let provider;
    let handler;
    let tracerFunc;

    if (providerType === 'brightdata_browser') {
      // Force Bright Data Browser
      provider = await selectBrightDataBrowserProvider(supabase, userId);
      handler = handleBrightDataBrowserProxy;
      tracerFunc = traceRedirectsBrightDataBrowser;
    } else {
      // Force Luna
      provider = await loadLunaFromSettings(supabase);
      handler = handleLunaProxy;
      tracerFunc = traceRedirectsBrowser;
    }

    console.log(`🔧 Using explicit provider: ${provider.name}`);

    const result = await handler(
      url,
      provider,
      { maxRedirects: 20, timeout: 90000 },
      tracerFunc,
      providerType === 'brightdata_browser' ? { user_id: userId } : undefined
    );

    return result;
  } catch (error) {
    logger.error('Error in explicit provider trace:', error);
    throw error;
  }
}

// ===================================================================
// EXAMPLE 4: Provider Rotation (Load Balancing)
// ===================================================================

const { selectRotationProvider } = require('./lib/proxy-providers-handler');

async function traceWithRotation(url, supabase, userId) {
  try {
    // Select next provider in rotation
    const provider = await selectRotationProvider(supabase, userId);

    console.log(`🔄 Using rotated provider: ${provider.name}`);

    const tracerFunc = provider.provider_type === 'brightdata_browser'
      ? traceRedirectsBrightDataBrowser
      : traceRedirectsBrowser;

    const result = await tracerFunc(url, {
      apiKey: provider.api_key || undefined,
      proxyHost: provider.host || undefined,
      proxyPort: provider.port || undefined,
      proxyUsername: provider.username || undefined,
      proxyPassword: provider.password || undefined,
      userContext: provider.provider_type === 'brightdata_browser'
        ? { user_id: userId, provider_id: provider.id }
        : undefined,
    });

    return result;
  } catch (error) {
    logger.error('Error in rotation trace:', error);
    throw error;
  }
}

// ===================================================================
// EXAMPLE 5: Conditional Routing (Based on URL/Conditions)
// ===================================================================

async function traceWithConditionalRouting(url, supabase, userId, offerId = null) {
  try {
    let provider;

    // Route based on URL patterns
    if (url.includes('premium-site.com')) {
      // Use Bright Data for premium sites (better JS rendering)
      const { selectBrightDataBrowserProvider } = require('./lib/proxy-providers-handler');
      provider = await selectBrightDataBrowserProvider(supabase, userId);
    } else if (url.includes('api.example.com')) {
      // Use Luna for API endpoints (lighter weight)
      const { loadLunaFromSettings } = require('./lib/proxy-providers-handler');
      provider = await loadLunaFromSettings(supabase);
    } else {
      // Use offer setting or default
      const { getProxyProviderForOffer } = require('./lib/proxy-providers-handler');
      provider = await getProxyProviderForOffer(supabase, userId, offerId, 'luna');
    }

    console.log(`🎯 Conditional routing selected: ${provider.name}`);

    // Trace with selected provider
    const tracerFunc = provider.provider_type === 'brightdata_browser'
      ? traceRedirectsBrightDataBrowser
      : traceRedirectsBrowser;

    return await tracerFunc(url, {
      apiKey: provider.api_key,
      proxyHost: provider.host,
      proxyPort: provider.port,
      proxyUsername: provider.username,
      proxyPassword: provider.password,
      userContext: provider.provider_type === 'brightdata_browser'
        ? { user_id: userId, provider_id: provider.id }
        : undefined,
    });
  } catch (error) {
    logger.error('Error in conditional routing trace:', error);
    throw error;
  }
}

// ===================================================================
// EXAMPLE 6: Integration in Express Route (Recommended Pattern)
// ===================================================================

app.post('/api/trace-with-providers', async (req, res) => {
  const { url, user_id, offer_id, provider_type } = req.body;

  try {
    let result;

    if (provider_type === 'auto') {
      // Auto-select based on offer
      result = await traceWithAutoProvider(url, supabase, user_id, offer_id);
    } else if (provider_type) {
      // Explicit provider selection
      result = await traceWithExplicitProvider(url, supabase, user_id, provider_type);
    } else {
      // Default: Use offer or rotation
      result = await traceWithAutoProvider(url, supabase, user_id, offer_id);
    }

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Trace route error:', error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// ===================================================================
// EXAMPLE 7: Fallback Chain (Graceful Degradation)
// ===================================================================

async function traceWithFallback(url, supabase, userId, offerId = null) {
  try {
    // Try 1: Use offer provider
    try {
      const { getProxyProviderForOffer } = require('./lib/proxy-providers-handler');
      const provider = await getProxyProviderForOffer(supabase, userId, offerId);
      
      if (provider.provider_type === 'brightdata_browser') {
        return await traceRedirectsBrightDataBrowser(url, {
          apiKey: provider.api_key,
          userContext: { user_id: userId, provider_id: provider.id },
        });
      } else {
        return await traceRedirectsBrowser(url, {
          proxyHost: provider.host,
          proxyPort: provider.port,
        });
      }
    } catch (err) {
      logger.warn('Offer provider failed, trying Bright Data Browser:', err.message);
    }

    // Try 2: Use any Bright Data Browser provider
    try {
      const { selectBrightDataBrowserProvider } = require('./lib/proxy-providers-handler');
      const provider = await selectBrightDataBrowserProvider(supabase, userId);
      return await traceRedirectsBrightDataBrowser(url, {
        apiKey: provider.api_key,
        userContext: { user_id: userId, provider_id: provider.id },
      });
    } catch (err) {
      logger.warn('Bright Data Browser failed, falling back to Luna:', err.message);
    }

    // Try 3: Luna fallback (always available)
    return await traceRedirectsBrowser(url, {
      proxyHost: 'proxy.luna.io',
      proxyPort: 8000,
    });
  } catch (error) {
    logger.error('All trace methods failed:', error);
    throw error;
  }
}

// ===================================================================
// EXPORTS for use in other modules
// ===================================================================

module.exports = {
  traceWithAutoProvider,
  traceWithFullRouting,
  traceWithExplicitProvider,
  traceWithRotation,
  traceWithConditionalRouting,
  traceWithFallback,
};
