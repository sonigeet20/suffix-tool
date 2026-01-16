/**
 * Trackier Dual-URL Setup Component
 * 
 * ISOLATED MODULE - Does not affect existing functionality
 * 
 * Allows users to configure Trackier integration for automatic suffix updates
 * without affecting existing manual tracing or Google Ads scripts
 */

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { autoMapParameters, formatAutoMapSummary } from '../utils/trackierAutoMap';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get the Supabase edge function URL for trace
const getEdgeFunctionUrl = (functionName: string) => {
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

// Helper to get the correct API base URL (use Supabase edge functions to proxy to backend)
const getApiBaseUrl = () => {
  // Always use edge functions - avoids mixed content (HTTPS to HTTP) issues
  return supabaseUrl;
};

interface TrackierSetupProps {
  offerId: string;
  offerName: string;
  finalUrl: string;
  trackingTemplate?: string;
  onClose: () => void;
}

interface TrackierOffer {
  id?: string;
  offer_id: string;
  offer_name: string;
  enabled: boolean;
  api_key: string;
  api_base_url: string;
  advertiser_id: string;
  url1_campaign_id: string;
  url1_campaign_id_real?: string;
  url1_campaign_name: string;
  url1_tracking_url?: string;
  url2_campaign_id: string;
  url2_campaign_id_real?: string;
  url2_campaign_name: string;
  url2_destination_url: string;
  url2_tracking_url?: string;
  url2_last_suffix: string;
  google_ads_template: string;
  final_url: string;
  suffix_pattern: string;
  use_proxy: boolean;
  tracer_mode: string;
  max_redirects: number;
  timeout_ms: number;
  update_interval_seconds: number;
  sub_id_mapping?: Record<string, string>;
  sub_id_values?: Record<string, string>;
  macro_mapping?: Record<string, string>;
  webhook_count?: number;
  update_count?: number;
  url2_last_updated_at?: string;
  last_webhook_at?: string;
  publisher_id?: string;
  webhook_url?: string;
  additional_pairs?: any[];
}

export default function TrackierSetup({ offerId, offerName, finalUrl, trackingTemplate, onClose }: TrackierSetupProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [loadingApiKey, setLoadingApiKey] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [updatingTemplates, setUpdatingTemplates] = useState(false);
  const [autoMapResult, setAutoMapResult] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);
  const [tracedParams, setTracedParams] = useState<Record<string, string> | null>(null);
  const [advertisers, setAdvertisers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [campaignCount, setCampaignCount] = useState<number>(1);
  const [pairsData, setPairsData] = useState<any[]>([]);

  const [config, setConfig] = useState<TrackierOffer>({
    offer_id: offerId,
    offer_name: offerName,
    enabled: false,
    api_key: '',
    api_base_url: 'https://api.trackier.com',
    advertiser_id: '',
    publisher_id: '2', // Default publisher ID
    url1_campaign_id: '',
    url1_campaign_name: 'Passthrough Campaign (URL 1)',
    url2_campaign_id: '',
    url2_campaign_name: 'Final Campaign (URL 2)',
    url2_destination_url: finalUrl,
    url2_last_suffix: '',
    google_ads_template: '',
    final_url: finalUrl,
    suffix_pattern: '?clickid={clickid}',
    use_proxy: true,
    tracer_mode: 'http_only',
    max_redirects: 20,
    timeout_ms: 45000,
    update_interval_seconds: 1, // 1 second for fast updates
    sub_id_mapping: {
      p1: 'gclid',
      p2: 'fbclid',
      p3: 'msclkid',
      p4: 'ttclid',
      p5: 'clickid',
      p6: 'utm_source',
      p7: 'utm_medium',
      p8: 'utm_campaign',
      p9: 'custom1',
      p10: 'custom2',
      erid: 'erid',
      app_name: 'app_name',
      app_id: 'app_id',
      cr_name: 'cr_name'
    },
  });

  const [stats, setStats] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [offerId]);

  // Auto-refresh webhook count every 10 seconds when enabled
  useEffect(() => {
    if (!autoRefresh || !config.id) return;

    const interval = setInterval(() => {
      loadConfig();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, config.id]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load API key from settings, but don't fail if migration not applied
      let settingsApiKey = null;
      try {
        settingsApiKey = await fetchTrackierApiKeyFromSettings();
      } catch (err) {
        console.warn('Could not load API key from settings:', err);
        // Continue anyway - trace works without API key
      }

      // Try to load existing config
      const { data, error: fetchError } = await supabase
        .from('trackier_offers')
        .select('*')
        .eq('offer_id', offerId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        const mergedConfig = {
          ...config,
          ...data,
          api_key: data.api_key || settingsApiKey || config.api_key,
          sub_id_mapping: data.sub_id_mapping || config.sub_id_mapping,
          // Ensure update_interval_seconds is at least 1
          update_interval_seconds: (data.update_interval_seconds && data.update_interval_seconds >= 1) 
            ? data.update_interval_seconds 
            : 1
        };
        setConfig(mergedConfig);
        
        // Load additional_pairs into pairsData if they exist
        console.log('Loading config, additional_pairs:', data.additional_pairs);
        if (data.additional_pairs && Array.isArray(data.additional_pairs) && data.additional_pairs.length > 0) {
          console.log('Setting pairsData with', data.additional_pairs.length, 'pairs');
          setPairsData(data.additional_pairs);
        }
        
        await loadStats(data.id);
      } else if (settingsApiKey) {
        setConfig((prev) => ({ ...prev, api_key: settingsApiKey }));
      }

    } catch (err: any) {
      console.error('Error loading Trackier config:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrackierApiKeyFromSettings = async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('settings')
        .select('trackier_api_key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        // Column might not exist yet if migration not applied
        if (error.code === '42703') {
          console.warn('trackier_api_key column not yet created - apply migration first');
          return null;
        }
        throw error;
      }

      return data?.trackier_api_key || null;
    } catch (err: any) {
      console.error('Error loading Trackier API key from settings:', err?.message || err);
      return null;
    }
  };

  const loadStats = async (trackierOfferId: string) => {
    try {
      const { data, error: statsError } = await supabase
        .rpc('get_trackier_stats', { offer_id_param: trackierOfferId });

      if (!statsError && data) {
        setStats(data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const extractSearchParams = (url: string): URLSearchParams => {
    try {
      if (!url) return new URLSearchParams();

      if (url.includes('://')) {
        const parsed = new URL(url);
        return parsed.searchParams;
      }

      if (url.startsWith('?')) {
        return new URLSearchParams(url.slice(1));
      }

      if (url.includes('?')) {
        return new URLSearchParams(url.split('?')[1]);
      }

      return new URLSearchParams();
    } catch (err) {
      console.error('Error parsing URL for params:', err);
      return new URLSearchParams();
    }
  };

  const buildSuffixPatternFromUrl = (url: string): string | null => {
    const params = Array.from(extractSearchParams(url).keys());
    if (!params.length) return null;

    const pattern = params.slice(0, 10).map((key) => `${key}={${key}}`).join('&');
    return `?${pattern}`;
  };

  const runAutoMap = async (nextSuffixPattern?: string) => {
    try {
      setAutoMapping(true);
      setError(null);

      const suffixPatternToUse = nextSuffixPattern || config.suffix_pattern;

      const result = autoMapParameters(
        config.final_url,
        config.url2_destination_url,
        suffixPatternToUse
      );

      setConfig((prev) => ({
        ...prev,
        suffix_pattern: suffixPatternToUse,
        sub_id_mapping: result.mapping,
      }));

      const summary = formatAutoMapSummary(result);
      setAutoMapResult(summary);
      setSuccess(`✅ Auto-mapped ${result.detectedParams.length} parameters!`);

      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error('Error auto-mapping parameters:', err);
      setError(`Failed to auto-map: ${err.message}`);
    } finally {
      setAutoMapping(false);
    }
  };

  const handleAutoMapParameters = async () => {
    await runAutoMap();
  };

  const handleAutoFillSuffixAndMap = async () => {
    const candidate = buildSuffixPatternFromUrl(config.url2_destination_url || config.final_url || '');

    if (!candidate) {
      setError('No query parameters found in Final URL to build a suffix pattern.');
      return;
    }

    await runAutoMap(candidate);
  };

  const handleLoadApiKeyFromSettings = async () => {
    try {
      setLoadingApiKey(true);
      setError(null);
      setSuccess(null);

      const settingsKey = await fetchTrackierApiKeyFromSettings();
      if (!settingsKey) {
        setError('No Trackier API key found in Settings.');
        return;
      }

      setConfig((prev) => ({ ...prev, api_key: settingsKey }));
      setSuccess('Loaded Trackier API key from Settings');
    } catch (err: any) {
      setError(err.message || 'Failed to load API key from Settings');
    } finally {
      setLoadingApiKey(false);
    }
  };

  const handleRunTraceAndAutoMap = async () => {
    try {
      setTracing(true);
      setError(null);
      setSuccess(null);
      setTracedParams(null);

      // Use the tracking template if available, otherwise fall back to final URL
      const urlToTrace = trackingTemplate || finalUrl;
      console.log('[TrackierSetup] Trace URL:', urlToTrace);
      console.log('[TrackierSetup] Source:', trackingTemplate ? 'tracking_template' : 'final_url');
      
      if (!urlToTrace) {
        throw new Error('No tracking URL available to trace. Make sure the offer has a Tracking Template or Final URL configured.');
      }

      const payload = {
        // offer_name triggers the get-suffix function which applies all offer settings:
        // - Proxy configuration & rotation
        // - Geo-targeting with strategy and weights
        // - Tracer mode selection
        // - Device distribution (UA rotation)
        // - Referrer handling
        // - Parameter filtering (all/whitelist/blacklist)
        // This ensures traced parameters match production behavior
        offer_name: config.offer_name,
      };

      console.log('[TrackierSetup] Sending trace request with offer_name:', config.offer_name);

      // Use Supabase edge function for trace
      const edgeFunctionUrl = getEdgeFunctionUrl('trackier-trace-once');
      console.log('[TrackierSetup] Edge function URL:', edgeFunctionUrl);
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TrackierSetup] Trace error response:', errorText);
        const errorData = response.headers.get('content-type')?.includes('application/json') 
          ? await response.json() 
          : { error: errorText };
        throw new Error(errorData.error || 'Trace failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Trace failed');
      }

      // Store traced params
      setTracedParams(result.query_params);

      // Build suffix pattern and auto-map
      if (result.query_params && Object.keys(result.query_params).length > 0) {
        const paramKeys = Object.keys(result.query_params).slice(0, 10);
        const suffixPattern = `?${paramKeys.map((key) => `${key}={${key}}`).join('&')}`;

        // Update config with traced suffix
        setConfig((prev) => ({
          ...prev,
          suffix_pattern: suffixPattern,
          url2_destination_url: result.resolved_final_url,
        }));

        // Auto-map using the traced params
        const { autoMapParameters, formatAutoMapSummary } = await import('../utils/trackierAutoMap');
        const mapResult = autoMapParameters(
          result.resolved_final_url,
          result.resolved_final_url,
          suffixPattern
        );

        setConfig((prev) => ({
          ...prev,
          sub_id_mapping: mapResult.mapping,
        }));

        const summary = formatAutoMapSummary(mapResult);
        setAutoMapResult(summary);
        setSuccess(`✅ Traced URL and auto-mapped ${mapResult.detectedParams.length} parameters!`);

        setTimeout(() => {
          setSuccess(null);
        }, 5000);
      } else {
        setSuccess('✅ Trace completed - no query parameters found to map');
      }
    } catch (err: any) {
      console.error('Error running trace:', err);
      setError(`Failed to trace URL: ${err.message}`);
    } finally {
      setTracing(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Validate required fields
      if (!config.api_key) {
        throw new Error('API Key is required');
      }
      if (!config.url1_campaign_id) {
        throw new Error('URL 1 Campaign ID is required');
      }
      if (!config.url2_campaign_id) {
        throw new Error('URL 2 Campaign ID is required');
      }
      
      // Ensure update_interval_seconds is a valid number >= 1
      const updateInterval = parseInt(String(config.update_interval_seconds)) || 1;
      if (updateInterval < 1) {
        throw new Error('Update interval must be at least 1 second');
      }
      
      console.log('Validating update_interval_seconds:', config.update_interval_seconds, '-> normalized to:', updateInterval);

      // Generate webhook URL with token parameter for offer mapping
      // Token is the offer UUID, Trackier will append {campaign_id} and {click_id}
      const baseWebhookUrl = `https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook`;
      const webhookUrl = `${baseWebhookUrl}?token=${config.id}&campaign_id={campaign_id}&click_id={click_id}`;
      
      const publisherId = config.publisher_id || '2'; // Default to 2 if not set
      
      // Build parameter placeholders from sub_id_mapping
      const subIdMapping = config.sub_id_mapping || {};
      const paramToPlaceholder: Record<string, string> = {};
      Object.entries(subIdMapping).forEach(([placeholder, paramName]) => {
        if (paramName) {
          paramToPlaceholder[paramName as string] = placeholder;
        }
      });
      
      const queryParams = Object.entries(paramToPlaceholder)
        .map(([paramName, placeholder]) => `${paramName}={${placeholder}}`)
        .join('&');
      
      // Build final destination URL with parameter placeholders
      const separator = config.final_url.includes('?') ? '&' : '?';
      const finalUrlWithParams = queryParams ? `${config.final_url}${separator}${queryParams}` : config.final_url;
      
      // Build double-nested Trackier URL structure:
      // URL1 (Google Ads template) → URL2 → final_url?params
      // URL2: Second Trackier URL with actual final_url + parameter placeholders for subIdOverride
      const url2Template = `https://nebula.gotrackier.com/click?campaign_id=${config.url2_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${encodeURIComponent(finalUrlWithParams)}`;
      const url2Encoded = encodeURIComponent(url2Template);
      
      // URL1: First Trackier URL wrapping URL2 + {lpurl} for Google Ads compliance
      const googleAdsTemplate = `https://nebula.gotrackier.com/click?campaign_id=${config.url1_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${url2Encoded}&lpurl={lpurl}`;
      
      // Update pairs with pair_index (no unique tokens needed)
      // Webhook system uses: token=<offer_id>&pair_index=<num>
      const pairsWithIndex = pairsData.map((pair, index) => ({
        ...pair,
        pair_index: pair.pair_index || (index + 1),
        enabled: pair.enabled !== undefined ? pair.enabled : true,
      }));
      
      const configToSave = {
        ...config,
        google_ads_template: googleAdsTemplate,
        webhook_url: webhookUrl,
        // Ensure _real fields are set (used by webhook function for API calls)
        url1_campaign_id_real: config.url1_campaign_id_real || config.url1_campaign_id,
        url2_campaign_id_real: config.url2_campaign_id_real || config.url2_campaign_id,
        // Ensure update_interval_seconds is a valid number >= 1
        update_interval_seconds: updateInterval,
        // Save pairsData to additional_pairs with pair_index (no unique tokens)
        additional_pairs: pairsWithIndex.length > 0 ? pairsWithIndex : null,
      };

      console.log('Saving config with pairsData:', pairsData.length, 'pairs');
      console.log('configToSave.additional_pairs:', configToSave.additional_pairs);
      console.log('configToSave.update_interval_seconds:', configToSave.update_interval_seconds, 'type:', typeof configToSave.update_interval_seconds);
      console.log('config.id:', config.id, '(will', config.id ? 'UPDATE' : 'INSERT', ')');

      let result;
      if (config.id) {
        // Update existing
        console.log('Updating existing offer with id:', config.id);
        const { data, error: updateError } = await supabase
          .from('trackier_offers')
          .update(configToSave)
          .eq('id', config.id)
          .select()
          .single();

        if (updateError) throw updateError;
        result = data;
      } else {
        // Insert new
        console.log('Inserting new offer');
        const { data, error: insertError } = await supabase
          .from('trackier_offers')
          .insert(configToSave)
          .select()
          .single();

        if (insertError) throw insertError;
        result = data;
      }

      setConfig(result);
      
      // Update pairsData from saved result to include generated tokens
      if (result.additional_pairs && Array.isArray(result.additional_pairs) && result.additional_pairs.length > 0) {
        setPairsData(result.additional_pairs);
      }
      
      setSuccess('Configuration saved successfully! Each pair uses offer ID + pair index for webhook routing.');
      
    } catch (err: any) {
      console.error('Error saving config:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);

      if (!config.id) {
        throw new Error('Please save the configuration first');
      }

      // Trigger manual update via edge function
      const apiUrl = `${getApiBaseUrl()}/functions/v1/trackier-trigger/${config.id}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Test failed');
      }

      const result = await response.json();
      setSuccess(`Test successful! Update completed in ${result.result?.duration_ms}ms`);
      
      // Reload config to see updated stats
      await loadConfig();

    } catch (err: any) {
      console.error('Error testing webhook:', err);
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleUpdateTemplates = async () => {
    try {
      setUpdatingTemplates(true);
      setError(null);
      setSuccess(null);

      if (!config.id) {
        throw new Error('Please save configuration first');
      }

      if (!config.sub_id_mapping || Object.keys(config.sub_id_mapping).length === 0) {
        throw new Error('Please configure parameter mapping (p1-p10) first. Run "Trace & Auto-Map" or "Auto-Map" to generate mappings.');
      }

      // Regenerate Google Ads template with current suffix pattern and mappings
      const publisherId = config.publisher_id || '2';
      
      // Build parameter placeholders from sub_id_mapping
      const paramToPlaceholder: Record<string, string> = {};
      Object.entries(config.sub_id_mapping).forEach(([placeholder, paramName]) => {
        if (paramName) {
          paramToPlaceholder[paramName as string] = placeholder;
        }
      });
      
      const queryParams = Object.entries(paramToPlaceholder)
        .map(([paramName, placeholder]) => `${paramName}={${placeholder}}`)
        .join('&');
      
      // Build final destination URL with parameter placeholders
      const separator = config.final_url.includes('?') ? '&' : '?';
      const finalUrlWithParams = queryParams ? `${config.final_url}${separator}${queryParams}` : config.final_url;
      
      // Build double-nested Trackier URL structure:
      // URL1 → URL2 → final_url?params
      // URL2 uses actual final_url with parameter placeholders so Trackier can populate them via subIdOverride
      const url2Template = `https://nebula.gotrackier.com/click?campaign_id=${config.url2_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${encodeURIComponent(finalUrlWithParams)}`;
      const url2Encoded = encodeURIComponent(url2Template);
      const updatedGoogleAdsTemplate = `https://nebula.gotrackier.com/click?campaign_id=${config.url1_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${url2Encoded}&lpurl={lpurl}`;

      // Update pairs if they exist
      let updatedPairs = pairsData;
      if (pairsData && pairsData.length > 0) {
        updatedPairs = pairsData.map((pair, index) => {
          // Build double-nested structure for each pair
          const pairUrl2 = `https://nebula.gotrackier.com/click?campaign_id=${pair.url2_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${encodeURIComponent(finalUrlWithParams)}`;
          const pairUrl2Encoded = encodeURIComponent(pairUrl2);
          const pairTemplate = `https://nebula.gotrackier.com/click?campaign_id=${pair.url1_campaign_id}&pub_id=${publisherId}&force_transparent=true&url=${pairUrl2Encoded}&lpurl={lpurl}`;
          
          // Remove old webhook fields and ensure pair_index is set
          const { webhook_token, webhook_url, ...pairWithoutOldFields } = pair;
          
          return {
            ...pairWithoutOldFields,
            google_ads_template: pairTemplate,
            pair_index: pair.pair_index || (index + 1)
          };
        });
        setPairsData(updatedPairs);
      }
      
      // Update config
      const updatedConfig = {
        ...config,
        google_ads_template: updatedGoogleAdsTemplate,
        additional_pairs: updatedPairs.length > 0 ? updatedPairs : config.additional_pairs
      };

      // Save to database
      const { data, error: updateError } = await supabase
        .from('trackier_offers')
        .update(updatedConfig)
        .eq('id', config.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setConfig(data);
      setSuccess('✅ Templates updated successfully with current parameter mappings!');
      
    } catch (err: any) {
      console.error('Error updating templates:', err);
      setError(err.message);
    } finally {
      setUpdatingTemplates(false);
    }
  };

  const handleValidateCredentials = async () => {
    try {
      setValidating(true);
      setError(null);
      setSuccess(null);

      if (!config.api_key) {
        throw new Error('Please enter your Trackier API key first');
      }

      // Validate credentials via edge function
      const apiUrl = `${getApiBaseUrl()}/functions/v1/trackier-validate-credentials`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: config.api_key,
          apiBaseUrl: config.api_base_url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Validation failed');
      }

      const result = await response.json();
      setSuccess(`✓ Credentials valid! Found ${result.advertisers?.length || 0} advertisers.`);
      
      // Store advertisers for selection
      if (result.advertisers && result.advertisers.length > 0) {
        setAdvertisers(result.advertisers);
        
        // Auto-select first advertiser if none selected
        if (!config.advertiser_id) {
          setConfig(prev => ({
            ...prev,
            advertiser_id: result.advertisers[0].id.toString()
          }));
        }
      }

    } catch (err: any) {
      console.error('Error validating credentials:', err);
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleCreateCampaigns = async () => {
    try {
      setCreating(true);
      setError(null);
      setSuccess(null);

      if (!config.api_key) {
        throw new Error('Please enter your Trackier API key first');
      }

      // Use the load balancer for webhook URL
      const webhookUrl = import.meta.env.VITE_WEBHOOK_URL || 
        'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com:3000/api/trackier-webhook';

      // Create campaigns via edge function with campaign_count parameter
      const apiUrl = `${getApiBaseUrl()}/functions/v1/trackier-create-campaigns`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: config.api_key,
          apiBaseUrl: config.api_base_url,
          advertiserId: config.advertiser_id,
          offerName: offerName,
          finalUrl: config.final_url,
          webhookUrl: webhookUrl,
          campaign_count: campaignCount // NEW: Support multiple pairs
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create campaigns');
      }

      const result = await response.json();

      // Store all pairs data
      setPairsData(result.pairs || [result.primary_pair]);

      // Update config with primary pair (backwards compatible)
      const primaryPair = result.primary_pair || result.pairs[0];
      setConfig({
        ...config,
        url1_campaign_id: primaryPair.url1_campaign_id,
        url1_campaign_id_real: primaryPair.url1_campaign_id_real,
        url1_campaign_name: primaryPair.url1_campaign_name || result.campaigns?.url1?.name,
        url1_tracking_url: primaryPair.url1_tracking_url,
        url2_campaign_id: primaryPair.url2_campaign_id,
        url2_campaign_id_real: primaryPair.url2_campaign_id_real,
        url2_campaign_name: primaryPair.url2_campaign_name || result.campaigns?.url2?.name,
        url2_tracking_url: primaryPair.url2_tracking_url,
        url2_destination_url: primaryPair.url2_destination_url || config.final_url,
        webhook_url: primaryPair.webhook_url,
        google_ads_template: primaryPair.google_ads_template
      });

      const pairCount = result.pairs?.length || 1;
      const totalCampaigns = pairCount * 2;
      setSuccess(`✅ Created ${pairCount} campaign pairs (${totalCampaigns} campaigns total)! ⚠️ Configure S2S Push URL in Trackier dashboard for each URL1 campaign!`);

    } catch (err: any) {
      console.error('Error creating campaigns:', err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`${label} copied to clipboard!`);
    setTimeout(() => setSuccess(null), 2000);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <p className="text-gray-900 dark:text-white">Loading Trackier configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Trackier Dual-URL Setup</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                Configure automatic suffix updates via Trackier webhooks
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Offer: <strong className="dark:text-white">{offerName}</strong>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Real-time Webhook Counter */}
          {config.id && (
            <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">📊</div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 uppercase">Webhooks Received</p>
                    <p className="text-3xl font-bold text-green-700">
                      {config.webhook_count || 0}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">Last Updated</p>
                  <p className="text-sm font-medium text-gray-800">
                    {config.url2_last_updated_at 
                      ? new Date(config.url2_last_updated_at).toLocaleTimeString()
                      : 'Never'}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => loadConfig()}
                      className="text-xs text-blue-600 dark:text-blue-300 hover:text-blue-800 underline"
                    >
                      🔄 Refresh
                    </button>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`text-xs ${autoRefresh ? 'text-green-600' : 'text-gray-600'} hover:text-green-800 dark:text-green-200 underline`}
                    >
                      {autoRefresh ? '⏸️ Auto' : '▶️ Auto'}
                    </button>
                  </div>
                </div>
              </div>
              {(config.webhook_count || 0) === 0 && (
                <p className="mt-2 text-xs text-orange-700 bg-orange-50 p-2 rounded">
                  ⚠️ No webhooks received yet. Make sure S2S Push URL is configured in Trackier Dashboard.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
              <p className="text-green-800 dark:text-green-200 text-sm">{success}</p>
            </div>
          )}

          {/* Stats Summary */}
          {config.id && stats && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-blue-600 dark:text-blue-300">Webhooks</p>
                  <p className="text-blue-900 dark:text-blue-100 font-bold">{stats.webhook_count || 0}</p>
                </div>
                <div>
                  <p className="text-blue-600 dark:text-blue-300">Updates</p>
                  <p className="text-blue-900 dark:text-blue-100 font-bold">{stats.update_count || 0}</p>
                </div>
                <div>
                  <p className="text-blue-600 dark:text-blue-300">Success Rate</p>
                  <p className="text-blue-900 dark:text-blue-100 font-bold">
                    {stats.success_rate ? `${stats.success_rate.toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600 dark:text-blue-300">Avg Duration</p>
                  <p className="text-blue-900 dark:text-blue-100 font-bold">
                    {stats.avg_trace_duration ? `${(stats.avg_trace_duration / 1000).toFixed(1)}s` : 'N/A'}
                  </p>
                </div>
              </div>
              {config.url2_last_updated_at && (
                <p className="text-xs text-blue-700 mt-2">
                  Last updated: {new Date(config.url2_last_updated_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white">Enable Trackier Integration</label>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Turn on automatic suffix updates via webhooks
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Trackier API Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                Trackier API Configuration
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={config.api_key}
                      onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Your Trackier API key"
                    />
                    <button
                      onClick={handleValidateCredentials}
                      disabled={validating || !config.api_key}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                    >
                      {validating ? 'Validating...' : 'Validate'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleLoadApiKeyFromSettings}
                      disabled={loadingApiKey}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingApiKey ? 'Loading from Settings...' : 'Load API Key from Settings'}
                    </button>
                    <p className="text-xs text-gray-500 flex-1 self-center">
                      Prefills your Trackier key from Settings to avoid retyping.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Base URL
                </label>
                <input
                  type="text"
                  value={config.api_base_url}
                  onChange={(e) => setConfig({ ...config, api_base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Advertiser <span className="text-red-500">*</span>
                </label>
                {advertisers.length > 0 ? (
                  <select
                    value={config.advertiser_id}
                    onChange={(e) => setConfig({ ...config, advertiser_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select an advertiser</option>
                    {advertisers.map((adv) => (
                      <option key={adv.id} value={adv.id}>
                        {adv.name} (ID: {adv.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={config.advertiser_id}
                      onChange={(e) => setConfig({ ...config, advertiser_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter advertiser ID or validate credentials to load list"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Click "Validate" above to load your advertisers
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Publisher ID
                </label>
                <input
                  type="text"
                  value={config.publisher_id || '2'}
                  onChange={(e) => setConfig({ ...config, publisher_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Publisher ID used in both URL 1 and URL 2 tracking links
                </p>
              </div>
            </div>

            {/* Campaign Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                Campaign Configuration
              </h3>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold mb-2">
                      🚀 Auto-Create Campaign Pairs
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                      Create multiple campaign pairs (URL1 + URL2) for A/B testing or different traffic sources.
                      Each pair uses the offer ID + pair index for webhook routing (no unique tokens needed).
                    </p>
                    
                    {/* Campaign Count Input */}
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        Number of Pairs:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={campaignCount}
                        onChange={(e) => setCampaignCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="w-20 px-2 py-1 border border-blue-300 dark:border-blue-600 rounded dark:bg-gray-700 dark:text-white text-center"
                        disabled={creating}
                      />
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        ({campaignCount * 2} campaigns + {campaignCount} templates)
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleCreateCampaigns}
                    disabled={creating || !config.api_key}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                  >
                    {creating ? 'Creating...' : `Create ${campaignCount} Pair${campaignCount > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Manual Setup:</strong> Or enter existing campaign IDs if you've already created them manually.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL 1 Campaign ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.url1_campaign_id}
                    onChange={(e) => setConfig({ ...config, url1_campaign_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="abc123"
                  />
                  <p className="text-xs text-gray-500 mt-1">Passthrough campaign (triggers webhook)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL 2 Campaign ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.url2_campaign_id}
                    onChange={(e) => setConfig({ ...config, url2_campaign_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="xyz789"
                  />
                  <p className="text-xs text-gray-500 mt-1">Final campaign (gets updated suffix)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Update Interval (seconds)
                </label>
                <input
                  type="number"
                  value={config.update_interval_seconds}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const validVal = (!isNaN(val) && val >= 1) ? val : 1;
                    setConfig({ ...config, update_interval_seconds: validVal });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  step="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Update interval in seconds (minimum 1 second)
                </p>
              </div>
            </div>

            {/* Tracer Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                Tracer Configuration
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Final URL
                </label>
                <input
                  type="text"
                  value={config.final_url}
                  onChange={(e) => setConfig({ ...config, final_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tracer Mode
                  </label>
                  <select
                    value={config.tracer_mode}
                    onChange={(e) => setConfig({ ...config, tracer_mode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="http_only">HTTP Only (Fast)</option>
                    <option value="browser">Browser (Full Rendering)</option>
                    <option value="anti_cloaking">Anti-Cloaking (Stealth)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Redirects
                  </label>
                  <input
                    type="number"
                    value={config.max_redirects}
                    onChange={(e) => setConfig({ ...config, max_redirects: parseInt(e.target.value) || 20 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                    min="5"
                    max="50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Suffix Pattern
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={config.suffix_pattern}
                    onChange={(e) => setConfig({ ...config, suffix_pattern: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="?clickid={clickid}"
                  />
                  <div className="flex gap-2 items-center">
                    <button
                      type="button"
                      onClick={handleAutoFillSuffixAndMap}
                      className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 rounded-md text-sm hover:bg-blue-100"
                    >
                      Auto-build from Final URL
                    </button>
                    <p className="text-xs text-gray-500">
                      Builds a suffix pattern from query params and auto-maps p1-p10.
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Pattern to extract from final URL
                  </p>
                </div>
              </div>
            </div>

            {/* P1-P10 Parameter Mapping */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2 flex-1">
                  Parameter Mapping (p1-p10)
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleRunTraceAndAutoMap}
                    disabled={tracing || !config.url2_destination_url}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium whitespace-nowrap"
                  >
                    {tracing ? '🔄 Tracing...' : '📍 Run Trace & Auto-Map'}
                  </button>
                  <button
                    onClick={handleAutoMapParameters}
                    disabled={autoMapping || !config.final_url}
                    className="ml-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium whitespace-nowrap"
                  >
                    {autoMapping ? '🔄 Auto-Mapping...' : '⚡ Auto-Map from URLs'}
                  </button>
                </div>
              </div>
              
              {tracedParams && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">✅ Traced URL Parameters:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {Object.entries(tracedParams).map(([key, value]) => (
                      <div key={key} className="bg-white dark:bg-gray-700 p-2 rounded border border-blue-100 dark:border-blue-800">
                        <code className="text-blue-600 dark:text-blue-300">{key}</code>
                        <span className="text-gray-500 dark:text-gray-400"> = </span>
                        <code className="text-gray-600 dark:text-gray-300">{String(value).substring(0, 15)}...</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {autoMapResult && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap font-mono text-xs">
                    {autoMapResult}
                  </p>
                </div>
              )}
              
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                <p className="text-sm text-purple-800 dark:text-purple-200 mb-2">
                  <strong>Map tracked parameters to Trackier's p1-p10 fields:</strong> Define which URL parameters 
                  should be passed through Trackier's sub_id fields. For example, map <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">gclid</code> to 
                  <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">p1</code>, so Trackier receives it as <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">p1=gclid_value</code>.
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  These mappings control how parameters flow through URL 1 → URL 2 in your Trackier campaigns.
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                  💡 <strong>Tip:</strong> Click "Run Trace & Auto-Map" to trace your URL and automatically detect parameters, or "Auto-Map from URLs" to use existing final URL.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                  const key = `p${num}`;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap w-12">
                        {key}:
                      </label>
                      <input
                        type="text"
                        value={config.sub_id_mapping?.[key] || ''}
                        onChange={(e) => setConfig({
                          ...config,
                          sub_id_mapping: {
                            ...config.sub_id_mapping,
                            [key]: e.target.value
                          }
                        })}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500 text-sm"
                        placeholder={`param_name`}
                      />
                    </div>
                  );
                })}

                {["erid", "app_name", "app_id", "cr_name"].map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap w-12">
                      {key}:
                    </label>
                    <input
                      type="text"
                      value={config.sub_id_mapping?.[key] || ''}
                      onChange={(e) => setConfig({
                        ...config,
                        sub_id_mapping: {
                          ...config.sub_id_mapping,
                          [key]: e.target.value
                        }
                      })}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500 text-sm"
                      placeholder={`param_name`}
                    />
                  </div>
                ))}
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  <strong>Example:</strong> If p1 maps to "gclid" and traced URL has <code className="bg-gray-200 px-1">gclid=xyz789</code>, 
                  Trackier will receive <code className="bg-green-100 px-1">p1=gclid=xyz789</code> and can pass it to your destination URL.
                </p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700">
                  <strong>💡 Tip:</strong> Leave unused fields empty. Trackier supports p1-p10 parameters: gclid, fbclid, msclkid, ttclid, clickid, utm_source, utm_medium, utm_campaign, custom1-2.
                </p>
              </div>
            </div>

            {/* Macro Mapping Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                Macro Mapping (Advanced)
              </h3>
              
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  <strong>How it works:</strong> When a traced suffix is found (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">clickid=abc123</code>), 
                  the actual value is replaced with Trackier macros (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">clickid={`{clickid}`}</code>). 
                  Trackier then resolves these macros on each click with fresh tracking IDs.
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  This ensures every click gets a unique tracking ID from Trackier, not a static value from the traced URL.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">URL Parameter</div>
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Trackier Macro</div>
                
                <div className="col-span-2 border-t border-gray-200"></div>
                
                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">clickid</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{clickid}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Trackier's unique click ID</span>
                </div>

                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">gclid</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{gclid}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Google Click ID</span>
                </div>

                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">fbclid</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{fbclid}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Facebook Click ID</span>
                </div>

                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">campaign</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{campaign_id}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Trackier campaign ID</span>
                </div>

                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">source</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{source}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Traffic source</span>
                </div>

                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm">publisher</code>
                </div>
                <div>
                  <code className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-sm text-green-800 dark:text-green-200">{`{publisher_id}`}</code>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Publisher/Affiliate ID</span>
                </div>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  <strong>Example:</strong> If traced URL has <code className="bg-gray-200 dark:bg-gray-600 px-1">clickid=abc123&gclid=xyz789</code>, 
                  it becomes <code className="bg-green-100 dark:bg-green-900/30 dark:text-green-200 px-1">clickid={`{clickid}`}&gclid={`{gclid}`}</code> in Trackier. 
                  When users click, Trackier replaces <code className="bg-gray-200 px-1">{`{clickid}`}</code> with a fresh unique ID.
                </p>
              </div>
            </div>

            {/* Google Ads Template */}
            {config.url1_campaign_id && config.id && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                  Google Ads Setup
                </h3>

                {/* S2S Push URL - Show prominently if webhook URL exists */}
                {config.webhook_url && (
                  <div className="p-4 bg-orange-50 border-2 border-orange-400 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-2xl">⚠️</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-orange-900 mb-2">
                          IMPORTANT: Configure S2S Push URL in Trackier Dashboard
                        </p>
                        <p className="text-xs text-orange-800 mb-3">
                          The Trackier API doesn't allow automatic webhook configuration. You must manually set the S2S Push URL in your Trackier dashboard:
                        </p>
                        <ol className="text-xs text-orange-800 mb-3 list-decimal list-inside space-y-1">
                          <li>Go to Trackier Dashboard → Campaigns</li>
                          <li>Edit the URL 1 campaign: <strong>{config.url1_campaign_name || config.url1_campaign_id}</strong></li>
                          <li>Scroll to "Server Side Clicks" section</li>
                          <li>Enable "Server Side Clicks" toggle</li>
                          <li>Paste the S2S Push URL below into the "S2S Push URL" field</li>
                          <li>Save the campaign</li>
                        </ol>
                        <div>
                          <label className="block text-xs font-semibold text-orange-900 mb-1">
                            S2S Push URL (Copy this):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={config.webhook_url}
                              readOnly
                              className="flex-1 px-3 py-2 border border-orange-300 dark:border-orange-700 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(config.webhook_url || '', 'S2S Push URL')}
                              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm font-medium"
                            >
                              Copy URL
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tracking Template
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.google_ads_template}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(config.google_ads_template, 'Template')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Use this as your Google Ads tracking template. Set it once - never change it!
                  </p>
                </div>

                {config.url2_last_suffix && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Suffix (URL 2 - Primary Pair)
                    </label>
                    <textarea
                      value={config.url2_last_suffix}
                      readOnly
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-xs font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Multi-Pair Management */}
            {pairsData.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b dark:border-gray-600 pb-2">
                  Campaign Pairs ({pairsData.length})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pairsData.map((pair, idx) => (
                    <div key={idx} className="p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          Pair {pair.pair_index} {pair.pair_name && `- ${pair.pair_name}`}
                        </h4>
                        <span className={`px-2 py-1 text-xs rounded ${pair.enabled !== false ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                          {pair.enabled !== false ? '✓ Enabled' : '✗ Disabled'}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">URL1:</span>
                          <span className="ml-2 text-gray-900 dark:text-white font-mono">{pair.url1_campaign_id}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">URL2:</span>
                          <span className="ml-2 text-gray-900 dark:text-white font-mono">{pair.url2_campaign_id}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">Webhook URL:</span>
                          <div className="ml-2 text-purple-600 dark:text-purple-400 font-mono text-[10px] break-all">
                            {config.id && pair.pair_index 
                              ? `${config.webhook_url?.split('?')[0]}?token=${config.id}&pair_index=${pair.pair_index}&campaign_id={campaign_id}&click_id={click_id}`
                              : 'Save configuration first'}
                          </div>
                        </div>
                        
                        {pair.webhook_count !== undefined && (
                          <div className="pt-2 border-t dark:border-gray-600">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Webhooks:</span>
                              <span className="font-semibold text-green-600">{pair.webhook_count || 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Updates:</span>
                              <span className="font-semibold text-blue-600">{pair.update_count || 0}</span>
                            </div>
                          </div>
                        )}

                        {/* Google Ads Template for this pair */}
                        {pair.google_ads_template && (
                          <div className="pt-2 border-t dark:border-gray-600">
                            <label className="block font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Template: <span className="text-xs text-gray-500">(URL1 → URL2 → final_url)</span>
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={pair.google_ads_template}
                                readOnly
                                className="flex-1 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-[10px]"
                              />
                              <button
                                onClick={() => copyToClipboard(pair.google_ads_template, `Pair ${pair.pair_index} Template`)}
                                className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px]"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Webhook URL */}
                        {config.id && config.webhook_url && (
                          <div className="pt-2">
                            <label className="block font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Webhook:
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={`${config.webhook_url?.split('?')[0] || config.webhook_url}?token=${config.id}&pair_index=${pair.pair_index}&campaign_id={campaign_id}&click_id={click_id}`}
                                readOnly
                                className="flex-1 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-[10px]"
                              />
                              <button
                                onClick={() => {
                                  const baseUrl = config.webhook_url?.split('?')[0] || config.webhook_url || '';
                                  copyToClipboard(`${baseUrl}?token=${config.id}&pair_index=${pair.pair_index}&campaign_id={campaign_id}&click_id={click_id}`, `Pair ${pair.pair_index} Webhook`);
                                }}
                                className="px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-[10px]"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Export All Templates */}
                <button
                  onClick={() => {
                    const webhookBaseUrl = config.webhook_url?.split('?')[0] || 'https://[your-project].supabase.co/functions/v1/trackier-webhook';
                    const csvContent = pairsData.map(p => {
                      const webhookUrl = `${webhookBaseUrl}?token=${config.id}&pair_index=${p.pair_index}&campaign_id={campaign_id}&click_id={click_id}`;
                      return `Pair ${p.pair_index},${p.url1_campaign_id},${p.url2_campaign_id},${config.id},${p.pair_index},"${webhookUrl}","${p.google_ads_template}"`;
                    }).join('\n');
                    const header = 'Pair,URL1_Campaign,URL2_Campaign,Offer_ID,Pair_Index,Webhook_URL,Google_Ads_Template\n';
                    const blob = new Blob([header + csvContent], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `trackier-pairs-${offerName.replace(/\s+/g, '-')}.csv`;
                    a.click();
                    setSuccess('✅ Exported all pairs to CSV');
                  }}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                >
                  📥 Export All Templates to CSV
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : config.id ? 'Update Configuration' : 'Create Configuration'}
              </button>

              {config.id && (
                <>
                  <button
                    onClick={handleUpdateTemplates}
                    disabled={updatingTemplates || !config.sub_id_mapping || Object.keys(config.sub_id_mapping || {}).length === 0}
                    className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    title={!config.sub_id_mapping || Object.keys(config.sub_id_mapping || {}).length === 0 ? 'Please configure parameter mappings first' : 'Regenerate templates with current mappings'}
                  >
                    {updatingTemplates ? '⚙️ Updating...' : '🔄 Update Templates'}
                  </button>
                  <button
                    onClick={handleTestWebhook}
                    disabled={testing || !config.enabled}
                    className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {testing ? 'Testing...' : 'Test Update'}
                  </button>
                </>
              )}

              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-200 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 font-medium"
              >
                Close
              </button>
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">How It Works</h3>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Create 2 campaigns in Trackier (URL 1 and URL 2)</li>
              <li>Configure URL 1 to redirect to URL 2</li>
              <li>Set URL 1 to fire webhook to your server</li>
              <li>Use the generated Google Ads template in your campaigns</li>
              <li>When clicks come in: URL 1 → Webhook → Background trace → Update URL 2</li>
              <li>Users get instant redirects (URL 2 always has fresh suffix pre-loaded)</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
