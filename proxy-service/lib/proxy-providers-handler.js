/**
 * Proxy Providers Handler
 * 
 * Manages multi-provider proxy selection and routing.
 * Decouples proxy provider logic from trace functions.
 * Honors proxy provider settings from offers and user configuration.
 */

// Simple logger (compatible with winston logger in server.js)
const logger = {
  info: (...args) => console.log('[ProxyProviders]', ...args),
  warn: (...args) => console.warn('[ProxyProviders]', ...args),
  error: (...args) => console.error('[ProxyProviders]', ...args),
};

/**
 * Dynamically select proxy provider for a user/offer combination
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} offerId - Optional offer ID for override
 * @param {string} defaultProvider - Default provider type (luna, brightdata_browser, rotation)
 * @returns {Promise<Object>} Provider configuration object
 */
async function getProxyProviderForOffer(supabase, userId, offerId = null, defaultProvider = 'luna') {
  try {
    // Step 1: Check if offer has a provider override
    if (offerId && userId) {
      const { data: offer, error: offerErr } = await supabase
        .from('offers')
        .select('provider_id, proxy_protocol')
        .eq('id', offerId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!offerErr && offer && offer.provider_id) {
        logger.info(`📌 Offer has provider override: ${offer.provider_id}`);

        // Handle special sentinel values
        if (offer.provider_id === 'USE_ROTATION') {
          logger.info('🔄 Offer configured for provider rotation');
          return await selectRotationProvider(supabase, userId);
        }

        if (offer.provider_id === 'USE_SETTINGS_LUNA') {
          logger.info('🔧 Offer configured for settings Luna (legacy)');
          return await loadLunaFromSettings(supabase);
        }

        // Fetch specific provider from proxy_providers table
        const { data: provider, error: provErr } = await supabase
          .from('proxy_providers')
          .select('*, proxy_protocol')
          .eq('id', offer.provider_id)
          .eq('user_id', userId)
          .eq('enabled', true)
          .maybeSingle();

        if (!provErr && provider) {
          // Offer proxy_protocol overrides provider proxy_protocol
          const effectiveProtocol = offer.proxy_protocol || provider.proxy_protocol || 'http';
          logger.info(`✅ Using offer provider: ${provider.name} (${provider.provider_type}), protocol: ${effectiveProtocol}`);
          return {
            success: true,
            provider_id: provider.id,
            provider_type: provider.provider_type,
            name: provider.name,
            enabled: provider.enabled,
            ...provider,
            proxy_protocol: effectiveProtocol, // Override with offer setting if present
          };
        } else {
          logger.warn(`⚠️ Offer provider not found or disabled: ${offer.provider_id}`);
        }
      }
    }

    // Step 2: Use default provider strategy
    logger.info(`📋 Using default provider strategy: ${defaultProvider}`);

    switch (defaultProvider) {
      case 'rotation':
        return await selectRotationProvider(supabase, userId);
      case 'brightdata_browser':
        return await selectBrightDataBrowserProvider(supabase, userId);
      case 'luna':
      default:
        return await loadLunaFromSettings(supabase);
    }
  } catch (error) {
    logger.error('Error selecting proxy provider:', error);
    throw error;
  }
}

/**
 * Select active provider from rotation
 * Uses round-robin or weighted selection from enabled providers
 */
async function selectRotationProvider(supabase, userId) {
  try {
    logger.info('🔄 Selecting from provider rotation...');

    const { data: providers, error: err } = await supabase
      .from('proxy_providers')
      .select('*, proxy_protocol')
      .eq('user_id', userId)
      .eq('enabled', true)
      .order('created_at', { ascending: true });

    if (err || !providers || providers.length === 0) {
      logger.warn('⚠️ No enabled providers for rotation, falling back to Luna');
      return await loadLunaFromSettings(supabase);
    }

    // Simple round-robin: pick one based on timestamp
    const index = Date.now() % providers.length;
    const selected = providers[index];

    logger.info(`✅ Rotation selected: ${selected.name} (${selected.provider_type})`);
    return {
      success: true,
      provider_id: selected.id,
      provider_type: selected.provider_type,
      name: selected.name,
      enabled: selected.enabled,
      ...selected,
    };
  } catch (error) {
    logger.error('Error selecting rotation provider:', error);
    throw error;
  }
}

/**
 * Select first enabled Bright Data Browser provider
 */
async function selectBrightDataBrowserProvider(supabase, userId) {
  try {
    const { data: provider, error } = await supabase
      .from('proxy_providers')
      .select('*, proxy_protocol')
      .eq('user_id', userId)
      .eq('provider_type', 'brightdata_browser')
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();

    if (error || !provider) {
      logger.warn('⚠️ No Bright Data Browser provider found, falling back to Luna');
      return await loadLunaFromSettings(supabase);
    }

    logger.info(`✅ Selected Bright Data Browser: ${provider.name}`);
    return {
      success: true,
      provider_id: provider.id,
      provider_type: provider.provider_type,
      name: provider.name,
      enabled: provider.enabled,
      ...provider,
    };
  } catch (error) {
    logger.error('Error selecting Bright Data Browser provider:', error);
    throw error;
  }
}

/**
 * Load Luna proxy settings from settings table
 */
async function loadLunaFromSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('luna_proxy_host, luna_proxy_port, luna_proxy_username, luna_proxy_password')
      .maybeSingle();

    if (error || !data) {
      throw new Error('Luna settings not found in database');
    }

    if (!data.luna_proxy_host || !data.luna_proxy_port || !data.luna_proxy_username || !data.luna_proxy_password) {
      throw new Error('Incomplete Luna proxy settings in database');
    }

    logger.info('✅ Loaded Luna proxy from settings');
    return {
      success: true,
      provider_type: 'luna',
      provider_id: 'luna_settings',
      name: 'Luna (Settings)',
      enabled: true,
      host: data.luna_proxy_host,
      port: data.luna_proxy_port,
      username: data.luna_proxy_username,
      password: data.luna_proxy_password,
      proxy_protocol: 'http', // Default to HTTP for settings-based Luna
    };
  } catch (error) {
    logger.error('Error loading Luna settings:', error);
    throw error;
  }
}

/**
 * Handle Luna proxy tracing
 * @param {string} url - Target URL
 * @param {Object} provider - Provider configuration from proxy_providers table
 * @param {Object} options - Trace options
 * @param {Function} tracer - Trace function to call
 * @returns {Promise<Object>} Trace result
 */
async function handleLunaProxy(url, provider, options = {}, tracer) {
  logger.info(`🌐 Routing to Luna proxy: ${provider.name}`);

  if (!tracer) {
    throw new Error('Luna tracer function not provided');
  }

  const proxyOptions = {
    ...options,
    proxyHost: provider.host,
    proxyPort: provider.port,
    proxyUsername: provider.username,
    proxyPassword: provider.password,
    proxyType: 'luna',
    proxyProtocol: provider.proxy_protocol || 'http',
  };

  return tracer(url, proxyOptions);
}

/**
 * Handle Bright Data Browser API tracing
 * @param {string} url - Target URL
 * @param {Object} provider - Provider configuration from proxy_providers table
 * @param {Object} options - Trace options
 * @param {Function} tracer - Trace function to call
 * @param {Object} userContext - User context object {user_id, account_id, session_id}
 * @returns {Promise<Object>} Trace result
 */
async function handleBrightDataBrowserProxy(url, provider, options = {}, tracer, userContext = {}) {
  logger.info(`🌐 Routing to Bright Data Browser: ${provider.name}`);

  if (!tracer) {
    throw new Error('Bright Data Browser tracer function not provided');
  }

  if (!provider.api_key) {
    throw new Error('Bright Data Browser provider missing API key');
  }

  const brightDataOptions = {
    ...options,
    apiKey: provider.api_key,
    proxyType: 'brightdata_browser',
    // Include user context - CRITICAL for Bright Data API
    userContext: {
      user_id: userContext.user_id,
      account_id: userContext.account_id || provider.user_id,
      session_id: userContext.session_id,
      provider_id: provider.id,
    },
  };

  return tracer(url, brightDataOptions);
}

/**
 * Handle proxy rotation
 * Cycles through multiple enabled providers
 */
async function handleRotationProxy(url, supabase, userId, options = {}, tracer) {
  logger.info('🔄 Handling provider rotation');

  const rotationProvider = await selectRotationProvider(supabase, userId);

  if (rotationProvider.provider_type === 'brightdata_browser') {
    return await handleBrightDataBrowserProxy(url, rotationProvider, options, tracer, {
      user_id: userId,
    });
  } else if (rotationProvider.provider_type === 'luna' || !rotationProvider.provider_type) {
    return await handleLunaProxy(url, rotationProvider, options, tracer);
  }

  throw new Error(`Unknown provider type: ${rotationProvider.provider_type}`);
}

/**
 * Route request to appropriate proxy provider handler
 * Main entry point for proxy provider routing
 */
async function routeToProxyProvider(
  url,
  supabase,
  userId,
  offerId = null,
  options = {},
  handlers = {}
) {
  const {
    lunaTracer,
    brightDataTracer,
    defaultProvider = 'luna',
  } = handlers;

  try {
    // Select provider based on offer/user config
    const provider = await getProxyProviderForOffer(supabase, userId, offerId, defaultProvider);

    // Route to appropriate handler
    if (provider.provider_type === 'brightdata_browser') {
      if (!brightDataTracer) {
        throw new Error('Bright Data Browser tracer handler not provided');
      }
      return await handleBrightDataBrowserProxy(url, provider, options, brightDataTracer, {
        user_id: userId,
      });
    } else if (provider.provider_type === 'rotation') {
      if (!lunaTracer || !brightDataTracer) {
        throw new Error('Rotation tracer handlers not provided');
      }
      return await selectRotationProvider(supabase, userId)
        .then(rotProvider =>
          rotProvider.provider_type === 'brightdata_browser'
            ? handleBrightDataBrowserProxy(url, rotProvider, options, brightDataTracer, { user_id: userId })
            : handleLunaProxy(url, rotProvider, options, lunaTracer)
        );
    } else {
      // Default to Luna
      if (!lunaTracer) {
        throw new Error('Luna tracer handler not provided');
      }
      return await handleLunaProxy(url, provider, options, lunaTracer);
    }
  } catch (error) {
    logger.error('Error routing to proxy provider:', error);
    throw error;
  }
}

module.exports = {
  getProxyProviderForOffer,
  selectRotationProvider,
  selectBrightDataBrowserProvider,
  loadLunaFromSettings,
  handleLunaProxy,
  handleBrightDataBrowserProxy,
  handleRotationProxy,
  routeToProxyProvider,
};
