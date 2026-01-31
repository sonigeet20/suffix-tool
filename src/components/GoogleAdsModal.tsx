import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Copy, Check, AlertCircle, Play, RefreshCw, ExternalLink } from 'lucide-react';
import GclidTraceMonitor from './GclidTraceMonitor';

interface GoogleAdsModalProps {
  offerName: string;
  onClose: () => void;
}

interface BucketStat {
  target_country: string;
  total_suffixes: number;
  available_suffixes: number;
  used_suffixes: number;
  oldest_unused: string | null;
  newest_unused: string | null;
}

interface ClickStats {
  click_date: string;
  clicks_today: number;
  suffixes_served: number;
  transparent_clicks: number;
  target_country: string | null;
}

interface GoogleAdsConfig {
  enabled: boolean;
  max_traces_per_day?: number;
  apply_filters?: boolean;
  single_geo_targets?: string[];
  multi_geo_targets?: string[];
  silent_fetch_enabled?: boolean;
  silent_fetch_url?: string;
  filtering?: {
    enabled: boolean;
    bot_detection: boolean;
    block_datacenters: boolean;
    block_vpn_proxy: boolean;
    repeat_ip_window_days: number;
    ip_blacklist: string[];
    ip_whitelist: string[];
    blocked_countries: string[];
    allowed_countries: string[];
  };
}

export default function GoogleAdsModal({ offerName, onClose }: GoogleAdsModalProps) {
  const [config, setConfig] = useState<GoogleAdsConfig>({
    enabled: false,
    max_traces_per_day: undefined,
    apply_filters: false,
    single_geo_targets: ['US', 'GB', 'ES', 'DE', 'FR', 'IT', 'CA', 'AU'],
    multi_geo_targets: ['US,GB,ES', 'US,GB,DE', 'US,CA,AU']
  });
  
  const [trackingDomains, setTrackingDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [finalUrl, setFinalUrl] = useState<string>('');
  const [targetCountry, setTargetCountry] = useState<string | null>(null);
  const [geoPool, setGeoPool] = useState<string[]>([]);
  const [bucketStats, setBucketStats] = useState<BucketStat[]>([]);
  const [clickStats, setClickStats] = useState<ClickStats | null>(null);
  const [template, setTemplate] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New state for custom bucket counts and real-time stats
  const [singleGeoCount, setSingleGeoCount] = useState(5);
  const [multiGeoCount, setMultiGeoCount] = useState(3);
  const [fillingStats, setFillingStats] = useState<any>(null);
  const [statsPolling, setStatsPolling] = useState<NodeJS.Timeout | null>(null);
  
  // State for recent click events (regular redirects from google_ads_click_events)
  const [recentClicks, setRecentClicks] = useState<any[]>([]);
  const [loadingClicks, setLoadingClicks] = useState(false);
  
  // State for silent fetch events (client-side cookie drops from google_ads_silent_fetch_stats)
  const [silentFetchClicks, setSilentFetchClicks] = useState<any[]>([]);
  const [loadingSilentClicks, setLoadingSilentClicks] = useState(false);
  
  // State for click analytics
  const [clickAnalytics, setClickAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  
  // State for tab navigation
  const [activeTab, setActiveTab] = useState<'config' | 'clicks' | 'traces'>('config');

  // Load initial data
  useEffect(() => {
    loadData();
  }, [offerName]);

  // Reload stats periodically (always for click events, silent fetch stats only when enabled)
  useEffect(() => {
    loadRecentClicks(); // Always load regular click events
    if (config.silent_fetch_enabled) {
      loadSilentFetchStats();
      loadSilentFetchClicks(); // Load silent fetch clicks when enabled
    }
    
    const interval = setInterval(() => {
      loadRecentClicks(); // Always refresh regular clicks
      if (config.silent_fetch_enabled) {
        loadSilentFetchStats();
        loadSilentFetchClicks(); // Refresh silent fetch clicks
      }
    }, 15000); // Refresh every 15s
    
    return () => clearInterval(interval);
  }, [config.silent_fetch_enabled, offerName]);

  // Update template when domain or finalUrl changes
  useEffect(() => {
    if (selectedDomain && finalUrl) {
      const encodedUrl = encodeURIComponent(finalUrl);
      setTemplate(
        `https://${selectedDomain}/click?offer_name=${offerName}&force_transparent=true&meta_refresh=true&debug_delay_ms=3000&redirect_url=${encodedUrl}`
      );
    } else if (selectedDomain && !finalUrl) {
      // Fallback with {lpurl} if no final URL provided
      setTemplate(
        `https://${selectedDomain}/click?offer_name=${offerName}&force_transparent=true&meta_refresh=true&debug_delay_ms=3000&redirect_url={lpurl}`
      );
    }
  }, [selectedDomain, offerName, finalUrl]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load tracking domains from settings
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('tracking_domains, google_ads_enabled')
        .single();

      if (settingsError) throw settingsError;

      const domains = settings?.tracking_domains || [];
      setTrackingDomains(domains);
      if (domains.length > 0 && !selectedDomain) {
        setSelectedDomain(domains[0]);
      }

      // Load offer config
      const { data: offer, error: offerError } = await supabase
        .from('offers')
        .select('google_ads_config, final_url, target_country, geo_pool')
        .eq('offer_name', offerName)
        .single();

      if (offerError) throw offerError;

      if (offer?.google_ads_config) {
        setConfig(offer.google_ads_config);
      }
      
      if (offer?.final_url) {
        setFinalUrl(offer.final_url);
      }
      
      // Load geo targeting settings
      if (offer?.target_country) {
        setTargetCountry(offer.target_country);
      }
      
      if (offer?.geo_pool && Array.isArray(offer.geo_pool)) {
        setGeoPool(offer.geo_pool);
      }

      // Load bucket stats
      await loadBucketStats();

      // Load today's click stats
      await loadClickStats();
      
      // Load click analytics (real vs bot breakdown)
      await loadClickAnalytics();
      
      // Load recent click events
      await loadRecentClicks();

    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadClickAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const { data, error } = await supabase.rpc('get_click_stats_by_category', {
        p_offer_name: offerName,
        p_days: 7
      });

      if (error) throw error;
      if (data && data.length > 0) {
        setClickAnalytics(data[0]);
      }
    } catch (err: any) {
      console.error('Error loading click analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadBucketStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_bucket_stats', {
        p_offer_name: offerName
      });

      if (error) throw error;
      setBucketStats(data || []);
    } catch (err: any) {
      console.error('Error loading bucket stats:', err);
    }
  };

  const loadClickStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('google_ads_click_stats')
        .select('*')
        .eq('offer_name', offerName)
        .eq('click_date', today)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore "not found" error
        throw error;
      }

      setClickStats(data);
    } catch (err: any) {
      console.error('Error loading click stats:', err);
    }
  };

  const loadSilentFetchStats = async () => {
    // This function loads silent fetch stats but is currently not displaying them
    // It's kept for potential future use or can be removed
    try {
      const { error } = await supabase.rpc('get_silent_fetch_stats', {
        p_offer_name: offerName,
        p_days: 7
      });

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Stats loaded successfully but not stored (recentClicks used instead)
    } catch (err: any) {
      console.error('Error loading silent fetch stats:', err);
    }
  };

  const loadSilentFetchClicks = async () => {
    try {
      setLoadingSilentClicks(true);
      const { data, error } = await supabase
        .from('google_ads_silent_fetch_stats')
        .select('*')
        .eq('offer_name', offerName)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Classify silent fetch clicks
      const classified = (data || []).map((row: any) => {
        let ipType = 'Real User';
        let reason = '';

        if (row.user_agent) {
          if (row.user_agent.includes('Googlebot') || row.user_agent.includes('AdsBot-Google') || row.user_agent.includes('Google-Adwords-Instant')) {
            ipType = 'Google Bot';
            reason = 'User agent contains Googlebot/AdsBot';
          } else if (row.user_agent.includes('bingbot') || row.user_agent.includes('BingPreview')) {
            ipType = 'Bing Bot';
            reason = 'User agent contains bingbot';
          }
        }

        if (row.client_ip && (row.client_ip.startsWith('66.249.') || row.client_ip.startsWith('66.102.') || row.client_ip.startsWith('64.233.'))) {
          ipType = 'Google Bot';
          reason = 'IP is from Google bot range';
        }

        if (row.client_ip && (row.client_ip.startsWith('172.') || row.client_ip.startsWith('10.') || row.client_ip.startsWith('192.168.'))) {
          ipType = 'Internal/Test';
          reason = 'Private IP address';
        }

        return { ...row, ipType, reason };
      });

      setSilentFetchClicks(classified);

    } catch (err: any) {
      console.error('Error loading silent fetch clicks:', err);
    } finally {
      setLoadingSilentClicks(false);
    }
  };

  const loadRecentClicks = async () => {
    try {
      setLoadingClicks(true);
      const { data, error } = await supabase
        .from('google_ads_click_events')
        .select('*')
        .eq('offer_name', offerName)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Classify clicks
      const classified = (data || []).map((row: any) => {
        let ipType = 'Real User';
        let reason = '';

        if (row.user_agent) {
          if (row.user_agent.includes('Googlebot') || row.user_agent.includes('AdsBot-Google') || row.user_agent.includes('Google-Adwords-Instant')) {
            ipType = 'Google Bot';
            reason = 'User agent contains Googlebot/AdsBot';
          } else if (row.user_agent.includes('bingbot') || row.user_agent.includes('BingPreview')) {
            ipType = 'Bing Bot';
            reason = 'User agent contains bingbot';
          } else if (row.user_agent.includes('Wheregoes.com')) {
            ipType = 'Redirect Checker';
            reason = 'Wheregoes redirect checker';
          }
        }

        if (row.user_ip && (row.user_ip.startsWith('66.249.') || row.user_ip.startsWith('66.102.') || row.user_ip.startsWith('64.233.'))) {
          ipType = 'Google Bot';
          reason = 'IP is from Google bot range';
        }

        if (row.user_ip && (row.user_ip.startsWith('172.') || row.user_ip.startsWith('10.') || row.user_ip.startsWith('192.168.'))) {
          ipType = 'Internal/Test';
          reason = 'Private IP address';
        }

        return { ...row, ipType, reason };
      });

      setRecentClicks(classified);

      // Calculate analytics
      const summary = classified.reduce((acc: any, row: any) => {
        acc[row.ipType] = (acc[row.ipType] || 0) + 1;
        return acc;
      }, {});

      const ipCounts = classified.reduce((acc: any, row: any) => {
        acc[row.user_ip] = (acc[row.user_ip] || 0) + 1;
        return acc;
      }, {});

      const repeatedIps = Object.entries(ipCounts).filter(([, count]) => (count as number) > 5);

      setClickAnalytics({
        total: classified.length,
        summary,
        repeatedIps: repeatedIps.length,
        cookiesWorking: repeatedIps.length === 0
      });

    } catch (err: any) {
      console.error('Error loading recent clicks:', err);
    } finally {
      setLoadingClicks(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Update offer config
      const { error: updateError } = await supabase
        .from('offers')
        .update({ google_ads_config: config })
        .eq('offer_name', offerName);

      if (updateError) throw updateError;

      // If enabling for first time, trigger initial bucket fill
      if (config.enabled && bucketStats.length === 0) {
        await fillBuckets(true);
      }

      alert('Google Ads configuration saved successfully!');
    } catch (err: any) {
      console.error('Error saving config:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fillBuckets = async (background = false) => {
    try {
      setFilling(true);
      setError(null);
      setFillingStats({ status: 'starting' });

      // Start polling for stats updates
      const pollInterval = setInterval(async () => {
        await loadBucketStats();
      }, 2000); // Poll every 2 seconds
      setStatsPolling(pollInterval);

      // Determine which geos to use based on offer settings
      let singleGeoTargets: string[];
      let multiGeoTargets: string[];
      
      if (targetCountry) {
        // Single geo targeting - use target_country
        singleGeoTargets = [targetCountry];
        multiGeoTargets = []; // Skip multi-geo for single country offers
      } else if (geoPool && geoPool.length > 0) {
        // Multi-geo targeting - use geo_pool
        singleGeoTargets = geoPool;
        // Generate multi-geo combinations from geo_pool (optional)
        multiGeoTargets = config.multi_geo_targets || [];
      } else {
        // Fallback to config defaults
        singleGeoTargets = config.single_geo_targets || [];
        multiGeoTargets = config.multi_geo_targets || [];
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fill-geo-buckets`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            offer_name: offerName,
            single_geo_targets: singleGeoTargets,
            multi_geo_targets: multiGeoTargets,
            single_geo_count: singleGeoCount,
            multi_geo_count: multiGeoCount,
            force: false
          })
        }
      );

      // Stop polling
      if (pollInterval) clearInterval(pollInterval);
      setStatsPolling(null);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setFillingStats(result);
      
      if (!background) {
        alert(`Buckets filled! Generated: ${result.total_generated}, Failed: ${result.total_failed}`);
      }

      // Final stats reload
      await loadBucketStats();
    } catch (err: any) {
      console.error('Error filling buckets:', err);
      if (statsPolling) clearInterval(statsPolling);
      setStatsPolling(null);
      if (!background) {
        setError(err.message);
      }
    } finally {
      setFilling(false);
    }
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const testClick = () => {
    const testUrl = template.replace('{lpurl}', 'https://example.com');
    window.open(testUrl, '_blank');
  };

  const testSilentFetch = () => {
    if (!config.silent_fetch_enabled) {
      alert('Silent fetch mode is not enabled!');
      return;
    }

    const trackingUrl = config.silent_fetch_url || 'https://example.com'; 
    const landingUrl = finalUrl || 'https://example.com';

    // Generate the same HTML that the server would generate
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="referrer" content="no-referrer">
  <title>Silent Fetch Test</title>
  <script>
    // Client-side silent fetch - ensures cookies are set in user's browser
    (function() {
      var trackingUrl = "${trackingUrl}";
      var landingUrl = "${landingUrl}";
      
      console.log('Starting silent fetch test...');
      console.log('Tracking URL:', trackingUrl);
      console.log('Landing URL:', landingUrl);
      
      // Fire tracking URL silently (cookies will be set in user's browser)
      fetch(trackingUrl, {
        method: 'GET',
        mode: 'no-cors', // Bypass CORS, don't need response
        credentials: 'include' // Include cookies
      }).then(function() {
        console.log('Silent fetch completed successfully');
      }).catch(function(err) {
        console.log('Silent fetch error (expected):', err);
      });
      
      // Redirect to landing page after 100ms (gives time for fetch to start)
      setTimeout(function() {
        console.log('Redirecting to landing page...');
        // window.location.href = landingUrl; // Uncomment to actually redirect
        alert('Silent fetch test completed! Check browser console (F12) for logs. Redirect would go to: ' + landingUrl);
      }, 100);
    })();
  </script>
</head>
<body>
  <p>Silent Fetch Test in Progress... (Check browser console)</p>
</body>
</html>`;

    // Open in new window to see console logs
    const win = window.open('', '_blank', 'width=600,height=400');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-neutral-900 rounded-lg p-8 max-w-4xl w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent mx-auto"></div>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">Loading Google Ads configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-lg max-w-5xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Google Ads Click Tracker
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {offerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex overflow-x-auto bg-neutral-50 dark:bg-neutral-850">
            <button
              onClick={() => setActiveTab('config')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'config'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Configuration
            </button>
            <button
              onClick={() => setActiveTab('clicks')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'clicks'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Click Events
            </button>
            <button
              onClick={() => setActiveTab('traces')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'traces'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              GCLID Traces
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Configuration Tab */}
          {activeTab === 'config' && (
            <>
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
            <div>
              <h3 className="font-medium text-neutral-900 dark:text-white">Enable Google Ads Tracking</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                Generate tracking URLs with geo-bucketed suffixes
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {config.enabled && (
            <>
              {/* Tracking Domain Selection */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Tracking Domain
                </label>
                {trackingDomains.length === 0 ? (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm">
                    No tracking domains configured. Add domains in Settings → tracking_domains
                  </div>
                ) : (
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-neutral-900 dark:text-white"
                  >
                    {trackingDomains.map((domain) => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Final URL Input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Final URL (Landing Page) *
                </label>
                <input
                  type="url"
                  value={finalUrl}
                  onChange={(e) => setFinalUrl(e.target.value)}
                  placeholder="e.g., https://surfshark.com/"
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-neutral-900 dark:text-white"
                />
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Enter the final landing page URL where users will be redirected (from your Offers tab)
                </p>
              </div>

              {/* Template URL */}
              {template && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Google Ads Final URL Template
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={template}
                      readOnly
                      className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg font-mono text-sm text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={copyTemplate}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={testClick}
                      className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-900 dark:text-white rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Use this URL in Google Ads as your Final URL. The {'{lpurl}'} parameter will be automatically replaced.
                  </p>
                </div>
              )}

              {/* Configuration Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Max Traces Per Day (optional)
                  </label>
                  <input
                    type="number"
                    value={config.max_traces_per_day || ''}
                    onChange={(e) => setConfig({ ...config, max_traces_per_day: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    GCLID Network Parameter
                  </label>
                  <input
                    type="text"
                    value={config.gclid_param_token || ''}
                    onChange={(e) => setConfig({ ...config, gclid_param_token: e.target.value })}
                    placeholder="e.g., xcust, subid, aff_sub"
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-neutral-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Parameter name that will hold the GCLID value in tracking URLs (e.g., "xcust" for Skimlinks)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="flex items-center gap-2 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.apply_filters || false}
                      onChange={(e) => setConfig({ ...config, apply_filters: e.target.checked })}
                      className="w-4 h-4 text-brand-600 bg-neutral-100 border-neutral-300 rounded focus:ring-brand-500 dark:focus:ring-brand-600 dark:ring-offset-neutral-900 focus:ring-2 dark:bg-neutral-700 dark:border-neutral-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">Apply Filters</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">Bot/IP/geo filtering</div>
                    </div>
                  </label>
                </div>
                
                {/* Repeat IP Window Setting */}
                {config.apply_filters && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Repeat IP Window (days)
                      <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                        If same IP returns within this period, they get clean redirect (no suffix)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={(config as any).filtering?.repeat_ip_window_days || 7}
                      onChange={(e) => {
                        const days = parseInt(e.target.value) || 0;
                        setConfig({
                          ...config,
                          filtering: {
                            ...((config as any).filtering || {}),
                            enabled: true,
                            repeat_ip_window_days: days
                          }
                        });
                      }}
                      className="w-32 px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-neutral-900 dark:text-white"
                    />
                    <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                      Set to 0 to disable repeat IP blocking. Default: 7 days
                    </div>
                  </div>
                )}

                {/* Silent Fetch Mode */}
                <div className="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={config.silent_fetch_enabled || false}
                          onChange={(e) => setConfig({ ...config, silent_fetch_enabled: e.target.checked })}
                          className="w-4 h-4 text-brand-600 bg-neutral-100 border-neutral-300 rounded focus:ring-brand-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">
                            Enable Silent Fetch Mode
                          </span>
                        </div>
                      </label>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 ml-6">
                        Silently hit tracking URL in background via client-side fetch. Cookies are set in user's browser. Bypasses bucket system entirely.
                      </p>
                    </div>
                    {config.silent_fetch_enabled && (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-medium whitespace-nowrap">
                        Active
                      </span>
                    )}
                  </div>
                  
                  {config.silent_fetch_enabled && (
                    <div className="mt-4 ml-6 space-y-4 border-l-2 border-blue-200 dark:border-blue-800 pl-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                          Tracking URL
                        </label>
                        <input
                          type="url"
                          value={config.silent_fetch_url || ''}
                          onChange={(e) => setConfig({ ...config, silent_fetch_url: e.target.value })}
                          placeholder="Leave empty to use offer URL"
                          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                        />
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                          If empty, will use offer URL from settings. The URL will be hit with user's IP and country headers.
                        </p>
                      </div>

                      {/* Test Silent Fetch Button */}
                      <button
                        onClick={testSilentFetch}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Test Silent Fetch
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(config as any).block_datacenters ?? true}
                      onChange={(e) => setConfig({ ...config, block_datacenters: e.target.checked } as any)}
                      className="w-4 h-4 rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">🖥️ Block Datacenters</span>
                  </label>

                    {/* VPN/Proxy Detection Toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(config as any).filtering?.block_vpn_proxy !== false}
                        onChange={(e) => {
                          setConfig({
                            ...config,
                            filtering: {
                              ...((config as any).filtering || {}),
                              enabled: true,
                              block_vpn_proxy: e.target.checked
                            }
                          });
                        }}
                        className="w-4 h-4 rounded border-neutral-300"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">🔐 Block VPN/Proxy</span>
                    </label>

                    {/* IP Blacklist */}
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        🚫 IP Blacklist (comma-separated)
                      </label>
                      <textarea
                        value={(config as any).filtering?.ip_blacklist?.join(', ') || ''}
                        onChange={(e) => {
                          const ips = e.target.value.split(',').map(ip => ip.trim()).filter(ip => ip);
                          setConfig({
                            ...config,
                            filtering: {
                              ...((config as any).filtering || {}),
                              enabled: true,
                              ip_blacklist: ips
                            }
                          });
                        }}
                        placeholder="10.0.0.1, 192.168.1.100"
                        className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white"
                        rows={2}
                      />
                    </div>

                    {/* Blocked Countries */}
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        🌍 Blocked Countries (comma-separated codes, e.g., RU,CN,KP)
                      </label>
                      <input
                        type="text"
                        value={(config as any).filtering?.blocked_countries?.join(', ') || ''}
                        onChange={(e) => {
                          const countries = e.target.value.split(',').map(c => c.trim().toUpperCase()).filter(c => c);
                          setConfig({
                            ...config,
                            filtering: {
                              ...((config as any).filtering || {}),
                              enabled: true,
                              blocked_countries: countries
                            }
                          });
                        }}
                        placeholder="RU, CN, KP"
                        className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white"
                      />
                    </div>
                  </div>
              </div>

              {/* Today's Stats */}
              {clickStats && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {clickStats.clicks_today}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Clicks Today</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {clickStats.suffixes_served}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">With Suffix</div>
                  </div>
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {clickStats.transparent_clicks}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">Transparent</div>
                  </div>
                </div>
              )}

              {/* Click Analytics - Real Users vs Bots */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Click Analytics (7 Days)
                  </h3>
                  <button
                    onClick={loadClickAnalytics}
                    disabled={loadingAnalytics}
                    className="px-3 py-1.5 bg-neutral-600 hover:bg-neutral-700 disabled:bg-neutral-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {loadingAnalytics ? (
                  <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                    <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
                  </div>
                ) : clickAnalytics ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {clickAnalytics.real_users}
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Real Users</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500">
                        {clickAnalytics.real_user_percentage}% of total
                      </div>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {clickAnalytics.google_bots}
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Google Bots</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500">
                        {clickAnalytics.google_bot_percentage}% of total
                      </div>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {clickAnalytics.total_clicks}
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Total Clicks</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500">
                        Last 7 days
                      </div>
                    </div>
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {clickAnalytics.invalid_clicks}
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Invalid/Lost Clicks</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500">
                        {((clickAnalytics.invalid_clicks / clickAnalytics.total_clicks) * 100).toFixed(1)}% of total
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                    <p className="text-neutral-600 dark:text-neutral-400">No analytics data available</p>
                  </div>
                )}
              </div>

              {/* Recent Click Logs - Regular Bucket Clicks (always visible) */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    📊 Recent Click Events (Regular Redirects)
                  </h3>
                  <button
                    onClick={loadRecentClicks}
                    disabled={loadingClicks}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded transition-colors flex items-center gap-1"
                    >
                      {loadingClicks ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Refresh
                        </>
                      )}
                    </button>
                  </div>

                  {/* Summary Cards */}
                  {clickAnalytics && (
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {clickAnalytics.total}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">Total Clicks</div>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-xl font-bold text-green-600 dark:text-green-400">
                          {clickAnalytics.summary?.['Real User'] || 0}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">Real Users</div>
                      </div>
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                          {clickAnalytics.summary?.['Google Bot'] || 0}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">Google Bots</div>
                      </div>
                      <div className={`p-3 rounded-lg ${clickAnalytics.cookiesWorking ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                        <div className={`text-xl font-bold ${clickAnalytics.cookiesWorking ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {clickAnalytics.cookiesWorking ? '✓' : '✗'}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">Cookies</div>
                      </div>
                    </div>
                  )}

                  {/* Clicks Table */}
                  {recentClicks.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                      <p className="text-neutral-600 dark:text-neutral-400">No clicks yet</p>
                    </div>
                  ) : (
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-neutral-50 dark:bg-neutral-800/50 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">Time</th>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">Type</th>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">IP</th>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">Country</th>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">User Agent</th>
                              <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300">Referrer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentClicks.map((click: any, index: number) => (
                              <tr key={index} className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                                  {new Date(click.created_at).toLocaleString()}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    click.ipType === 'Real User' 
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : click.ipType === 'Google Bot'
                                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                                  }`}>
                                    {click.ipType}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-neutral-600 dark:text-neutral-400">
                                  {click.user_ip?.substring(0, 20)}
                                  {click.user_ip?.length > 20 && '...'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                                  {click.target_country || '-'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 max-w-xs truncate" title={click.user_agent}>
                                  {click.user_agent || '(not logged)'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                                  {click.referrer || '(none)'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

              {/* Silent Fetch Click Events - only show when silent fetch is enabled */}
              {config.silent_fetch_enabled && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      🔵 Silent Fetch Events (Client-Side Cookie Drops)
                    </h3>
                    <button
                      onClick={loadSilentFetchClicks}
                      disabled={loadingSilentClicks}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingSilentClicks ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {loadingSilentClicks ? (
                    <div className="p-8 text-center bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                      <p className="text-blue-600 dark:text-blue-400">Loading silent fetch events...</p>
                    </div>
                  ) : silentFetchClicks.length === 0 ? (
                    <div className="p-8 text-center bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-blue-600 dark:text-blue-400">No silent fetch events recorded yet</p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">These are client-side fetches that drop cookies without redirect</p>
                    </div>
                  ) : (
                    <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50 dark:bg-blue-900/30 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">Time</th>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">Type</th>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">IP</th>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">Country</th>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">User Agent</th>
                              <th className="px-3 py-2 text-left text-blue-700 dark:text-blue-300">Referrer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {silentFetchClicks.map((click: any, index: number) => (
                              <tr key={index} className="border-t border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                                  {new Date(click.created_at).toLocaleString()}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    click.ipType === 'Real User' 
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : click.ipType === 'Google Bot'
                                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                                  }`}>
                                    {click.ipType}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-neutral-600 dark:text-neutral-400">
                                  {click.client_ip?.substring(0, 20)}
                                  {click.client_ip?.length > 20 && '...'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                                  {click.client_country || '-'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 max-w-xs truncate" title={click.user_agent}>
                                  {click.user_agent || '(not logged)'}
                                </td>
                                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                                  {click.referrer || '(none)'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bucket Stats - hide when silent fetch mode is enabled */}
              {!config.silent_fetch_enabled && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Geo Suffix Buckets
                  </h3>
                  <button
                    onClick={() => fillBuckets(false)}
                    disabled={filling}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    {filling ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Filling...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Fill Buckets
                      </>
                    )}
                  </button>
                </div>

                {/* Bucket Count Settings */}
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    ⚠️ <strong>Note:</strong> Each suffix takes ~10-15 seconds to generate. Start with small counts (5-10) to avoid timeouts.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Single Geo Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={singleGeoCount}
                      onChange={(e) => setSingleGeoCount(parseInt(e.target.value) || 30)}
                      disabled={filling}
                      className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white text-sm disabled:opacity-50"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Suffixes per single geo</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Multi Geo Count
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={multiGeoCount}
                      onChange={(e) => setMultiGeoCount(parseInt(e.target.value) || 0)}
                      disabled={filling}
                      className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white text-sm disabled:opacity-50"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Suffixes per multi geo (0 to skip)</p>
                  </div>
                </div>

                {/* Real-time Filling Stats */}
                {filling && fillingStats && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">📊 Filling in progress...</p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-neutral-600 dark:text-neutral-400">Generated</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{fillingStats.total_generated || 0}</p>
                      </div>
                      <div>
                        <p className="text-neutral-600 dark:text-neutral-400">Failed</p>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">{fillingStats.total_failed || 0}</p>
                      </div>
                      <div>
                        <p className="text-neutral-600 dark:text-neutral-400">Duration</p>
                        <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400">{fillingStats.duration_ms ? `${(fillingStats.duration_ms / 1000).toFixed(1)}s` : '--'}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {bucketStats.length === 0 ? (
                  <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                    <p className="text-neutral-600 dark:text-neutral-400">No buckets yet. Click "Fill Buckets" to start.</p>
                  </div>
                ) : (
                  <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 dark:bg-neutral-800/50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2 text-left text-neutral-700 dark:text-neutral-300">Country</th>
                          <th className="px-4 py-2 text-right text-neutral-700 dark:text-neutral-300">Total</th>
                          <th className="px-4 py-2 text-right text-neutral-700 dark:text-neutral-300">Available</th>
                          <th className="px-4 py-2 text-right text-neutral-700 dark:text-neutral-300">Used</th>
                          <th className="px-4 py-2 text-right text-neutral-700 dark:text-neutral-300">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bucketStats.map((stat) => (
                          <tr key={stat.target_country} className="border-t border-neutral-200 dark:border-neutral-800">
                            <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">
                              {stat.target_country}
                            </td>
                            <td className="px-4 py-2 text-right text-neutral-600 dark:text-neutral-400">
                              {stat.total_suffixes}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className={
                                stat.available_suffixes < 5 
                                  ? 'text-red-600 dark:text-red-400 font-medium'
                                  : 'text-green-600 dark:text-green-400'
                              }>
                                {stat.available_suffixes}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-neutral-600 dark:text-neutral-400">
                              {stat.used_suffixes}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {stat.available_suffixes < 5 ? (
                                <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">
                                  Low
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-400 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
            </>
          )}

          {/* Click Events Tab */}
          {activeTab === 'clicks' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This tab shows click analytics, recent click events, and silent fetch statistics for monitoring user interactions.
                </p>
              </div>
              
              {/* Add click analytics here - placeholder for now */}
              <div className="text-center py-8 text-neutral-600 dark:text-neutral-400">
                Click events and analytics section - Coming soon
              </div>
            </div>
          )}

          {/* GCLID Traces Tab */}
          {activeTab === 'traces' && (
            <GclidTraceMonitor offerName={offerName} />
          )}
        </div>

        {/* Footer - only show on config tab */}
        {activeTab === 'config' && (
        <div className="flex items-center justify-end gap-3 p-6 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-900 dark:text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-400 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
