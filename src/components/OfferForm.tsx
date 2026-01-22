import { useState, useEffect } from 'react';
import { supabase, Offer, TraceResult } from '../lib/supabase';
import {
  X, Save, Play, RefreshCw, AlertCircle,
  Clock, ArrowRight, CheckCircle, XCircle,
  ChevronDown, ChevronUp, ExternalLink, Copy,
  Plus, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';

interface OfferFormProps {
  offer?: Offer;
  onClose: () => void;
  onSave: () => void;
}

interface TrackingUrlEntry {
  url: string;
  weight: number;
  enabled: boolean;
  label: string;
}

interface ReferrerEntry {
  url: string;
  weight: number;
  enabled: boolean;
  label: string;
  hops?: number[]; // Optional: specific hops for this referrer (e.g., [1,2,3]). If empty/null, applies to all hops
}

export default function OfferForm({ offer, onClose, onSave }: OfferFormProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'rotation' | 'parameters' | 'tracer'>('settings');
  const [formData, setFormData] = useState({
    offer_name: offer?.offer_name || '',
    campaign_name: (offer as any)?.campaign_name || '',
    final_url: offer?.final_url || '',
    tracking_template: offer?.tracking_template || '',
    suffix_pattern: offer?.suffix_pattern || '',
    target_geo: offer?.target_geo || '',
    target_country: offer?.target_country || '',
    custom_referrer: offer?.custom_referrer || '',
    redirect_chain_step: offer?.redirect_chain_step || 0,
    retry_limit: (offer as any)?.retry_limit ?? 3,
    retry_delay_ms: (offer as any)?.retry_delay_ms ?? 2000,
    is_active: offer?.is_active ?? true,
    tracking_urls: (offer as any)?.tracking_urls || [],
    tracking_url_rotation_mode: (offer as any)?.tracking_url_rotation_mode || 'sequential',
    referrers: (offer as any)?.referrers || [],
    referrer_rotation_mode: (offer as any)?.referrer_rotation_mode || 'sequential',
    param_filter: (offer as any)?.param_filter || [],
    param_filter_mode: (offer as any)?.param_filter_mode || 'all',
    tracer_mode: (offer as any)?.tracer_mode || 'auto',
    block_resources: (offer as any)?.block_resources ?? true,
    extract_only: (offer as any)?.extract_only ?? true,
    extract_from_location_header: (offer as any)?.extract_from_location_header ?? false,
    location_extract_hop: (offer as any)?.location_extract_hop || null,
    geo_pool: (offer as any)?.geo_pool || [],
    geo_strategy: (offer as any)?.geo_strategy || 'weighted',
    geo_weights: (offer as any)?.geo_weights || {},
    provider_id: (offer as any)?.provider_id || null,
    proxy_protocol: (offer as any)?.proxy_protocol || 'http',
    device_distribution: (offer as any)?.device_distribution || [
      { deviceCategory: 'mobile', weight: 60 },
      { deviceCategory: 'desktop', weight: 30 },
      { deviceCategory: 'tablet', weight: 10 }
    ],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trackingUrls, setTrackingUrls] = useState<TrackingUrlEntry[]>(formData.tracking_urls || []);
  const [referrers, setReferrers] = useState<ReferrerEntry[]>(formData.referrers || []);
  const [paramFilter, setParamFilter] = useState<string[]>(formData.param_filter || []);
  const [newParamName, setNewParamName] = useState('');
  const [geoPool, setGeoPool] = useState<string[]>(formData.geo_pool || []);
  const [geoStrategy, setGeoStrategy] = useState<string>(formData.geo_strategy || 'weighted');
  const [geoWeights, setGeoWeights] = useState<Record<string, number>>(formData.geo_weights || {});
  const [newGeoCountry, setNewGeoCountry] = useState('');
  const [deviceDistribution, setDeviceDistribution] = useState<Array<{ deviceCategory: string; weight: number }>>(
    formData.device_distribution || [
      { deviceCategory: 'mobile', weight: 60 },
      { deviceCategory: 'desktop', weight: 30 },
      { deviceCategory: 'tablet', weight: 10 }
    ]
  );

  const [maxRedirects, setMaxRedirects] = useState<number>(20);
  const [timeout, setTimeout] = useState<number>(60000);
  const [userAgent, setUserAgent] = useState<string>('');
  const [useProxy, setUseProxy] = useState<boolean>(true);
  const [tracerMode, setTracerMode] = useState<string>('http_only');
  const [tracing, setTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [selectedStepForSave, setSelectedStepForSave] = useState<number | null>(null);

  const [providers, setProviders] = useState<Array<{ id: string; name: string; provider_type: string; enabled: boolean }>>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [hasLunaSettings, setHasLunaSettings] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoadingProviders(false);
        return;
      }

      // Fetch proxy providers
      const { data, error } = await supabase
        .from('proxy_providers')
        .select('id, name, provider_type, enabled')
        .eq('user_id', session.user.id)
        .order('priority', { ascending: true });

      if (!error && data) {
        setProviders(data);
      }

      // Check if Luna settings exist
      const { data: settings } = await supabase
        .from('settings')
        .select('luna_proxy_host, luna_proxy_port, luna_proxy_username, luna_proxy_password')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (settings && settings.luna_proxy_host) {
        setHasLunaSettings(true);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      tracking_urls: trackingUrls,
      referrers: referrers,
      param_filter: paramFilter,
      geo_pool: geoPool,
      geo_strategy: geoStrategy,
      geo_weights: geoWeights,
      device_distribution: deviceDistribution,
    }));
  }, [trackingUrls, referrers, paramFilter, geoPool, geoStrategy, geoWeights, deviceDistribution]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!formData.offer_name.trim()) {
      setError('Offer name is required');
      setLoading(false);
      return;
    }

    if (!formData.campaign_name.trim()) {
      setError('Campaign name is required');
      setLoading(false);
      return;
    }

    if (!formData.final_url.trim()) {
      setError('Final URL is required');
      setLoading(false);
      return;
    }

    // Validate device distribution totals 100%
    const totalWeight = deviceDistribution.reduce((sum, d) => sum + d.weight, 0);
    if (totalWeight !== 100) {
      setError(`Device distribution must total 100% (currently ${totalWeight}%)`);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const normalizeEnabled = <T extends { enabled?: boolean }>(items: T[]) =>
        items.map(item => ({ ...item, enabled: item.enabled !== false }));

      const dataToSave = {
        ...formData,
        tracking_urls: normalizeEnabled(trackingUrls),
        referrers: normalizeEnabled(referrers),
        param_filter: paramFilter,
        geo_pool: geoPool,
        geo_strategy: geoStrategy,
        geo_weights: geoWeights,
        device_distribution: deviceDistribution,
      };

      if (offer) {
        const { error } = await supabase
          .from('offers')
          .update(dataToSave)
          .eq('id', offer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('offers').insert([{
          ...dataToSave,
          user_id: user.id,
        }]);
        if (error) throw error;
      }
      onSave();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addTrackingUrl = () => {
    setTrackingUrls([...trackingUrls, { url: '', weight: 50, enabled: true, label: '' }]);
  };

  const updateTrackingUrl = (index: number, field: keyof TrackingUrlEntry, value: any) => {
    const updated = [...trackingUrls];
    updated[index] = { ...updated[index], [field]: value };
    setTrackingUrls(updated);
  };

  const removeTrackingUrl = (index: number) => {
    setTrackingUrls(trackingUrls.filter((_, i) => i !== index));
  };

  const addReferrer = () => {
    setReferrers([...referrers, { url: '', weight: 50, enabled: true, label: '' }]);
  };

  const updateReferrer = (index: number, field: keyof ReferrerEntry, value: any) => {
    const updated = [...referrers];
    updated[index] = { ...updated[index], [field]: value };
    setReferrers(updated);
  };

  const removeReferrer = (index: number) => {
    setReferrers(referrers.filter((_, i) => i !== index));
  };

  const addParamToFilter = () => {
    if (newParamName && !paramFilter.includes(newParamName)) {
      setParamFilter([...paramFilter, newParamName]);
      setNewParamName('');
    }
  };

  const removeParamFromFilter = (param: string) => {
    setParamFilter(paramFilter.filter(p => p !== param));
  };

  const executeTrace = async () => {
    if (!formData.tracking_template && !formData.final_url) {
      setTraceError('Please provide a tracking template or final URL');
      return;
    }

    setTracing(true);
    setTraceError(null);
    setTraceResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Prefer an enabled tracking URL from the rotation tab (even before saving)
      // Assume missing enabled flag means enabled (back-compat with older records)
      const enabledTracking = trackingUrls.filter(t => (t.enabled !== false) && t.url);
      let selectedTrackingUrl = '';
      if (enabledTracking.length > 0) {
        if (formData.tracking_url_rotation_mode === 'random') {
          const idx = Math.floor(Math.random() * enabledTracking.length);
          selectedTrackingUrl = enabledTracking[idx].url;
        } else if (formData.tracking_url_rotation_mode === 'weighted-random') {
          const total = enabledTracking.reduce((sum, t) => sum + (t.weight || 1), 0);
          let r = Math.random() * total;
          for (const t of enabledTracking) {
            r -= (t.weight || 1);
            if (r <= 0) {
              selectedTrackingUrl = t.url;
              break;
            }
          }
          if (!selectedTrackingUrl) {
            selectedTrackingUrl = enabledTracking[0].url;
          }
        } else {
          // sequential preview can't advance without persistence; use first enabled to avoid falling back to template
          selectedTrackingUrl = enabledTracking[0].url;
        }
      }

      const url = selectedTrackingUrl || formData.tracking_template || formData.final_url;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trace-redirects`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          max_redirects: maxRedirects,
          timeout_ms: timeout,
          user_agent: userAgent || undefined,
          use_proxy: useProxy,
          target_country: formData.target_geo || null,
          tracer_mode: tracerMode,
          expected_final_url: formData.final_url || undefined,
          geo_pool: geoPool.length > 0 ? geoPool : undefined,
          geo_strategy: geoPool.length > 0 ? geoStrategy : undefined,
          geo_weights: geoPool.length > 0 && geoStrategy === 'weighted' ? geoWeights : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
      }

      const result: TraceResult = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Trace failed');
      }

      setTraceResult(result);

    } catch (err: any) {
      setTraceError(err.message || 'Failed to execute trace');
    } finally {
      setTracing(false);
    }
  };

  const saveStepConfiguration = async () => {
    if (selectedStepForSave === null) {
      alert('Please select a step first');
      return;
    }

    if (!offer) {
      setFormData({
        ...formData,
        redirect_chain_step: selectedStepForSave,
      });
      alert('Step configuration updated! Save the offer in Settings tab to persist changes.');
      setSelectedStepForSave(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('offers')
        .update({ redirect_chain_step: selectedStepForSave })
        .eq('id', offer.id);

      if (error) throw error;

      setFormData({
        ...formData,
        redirect_chain_step: selectedStepForSave,
      });

      alert(`Configuration saved! Now using step ${selectedStepForSave + 1} for parameter extraction.`);
      setSelectedStepForSave(null);
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
      alert('Failed to save configuration: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-100 text-green-700';
    if (status >= 300 && status < 400) return 'bg-blue-100 text-blue-700';
    if (status >= 400 && status < 500) return 'bg-orange-100 text-orange-700';
    if (status >= 500) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getRedirectTypeColor = (type: string) => {
    switch (type) {
      case 'http': return 'bg-blue-100 text-blue-700';
      case 'meta': return 'bg-pink-100 text-pink-700';
      case 'javascript': return 'bg-yellow-100 text-yellow-700';
      case 'final': return 'bg-green-100 text-green-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            {offer ? 'Edit Offer' : 'Create New Offer'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-smooth"
          >
            <X size={24} />
          </button>
        </div>

        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex overflow-x-auto bg-neutral-50 dark:bg-neutral-850">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('rotation')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'rotation'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              URL & Referrer Rotation
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'parameters'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Parameter Filtering
            </button>
            <button
              onClick={() => setActiveTab('tracer')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-smooth whitespace-nowrap ${
                activeTab === 'tracer'
                  ? 'border-brand-600 dark:border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Redirect Tracer
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'settings' ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Offer Name
                </label>
                <input
                  type="text"
                  value={formData.offer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, offer_name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={formData.campaign_name}
                  onChange={(e) =>
                    setFormData({ ...formData, campaign_name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  placeholder="e.g., Black Friday 2025, Spring Campaign"
                  required
                />
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Use this to group and identify related offers (searchable)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Final URL
                </label>
                <input
                  type="url"
                  value={formData.final_url}
                  onChange={(e) =>
                    setFormData({ ...formData, final_url: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Legacy Tracking Template (fallback if no rotation URLs configured)
                </label>
                <input
                  type="url"
                  value={formData.tracking_template}
                  onChange={(e) =>
                    setFormData({ ...formData, tracking_template: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Target Geo
                  </label>
                  <input
                    type="text"
                    value={formData.target_geo}
                    onChange={(e) =>
                      setFormData({ ...formData, target_geo: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                    placeholder="e.g., US, UK"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Target Country for Proxy
                  </label>
                  <input
                    type="text"
                    value={formData.target_country}
                    onChange={(e) =>
                      setFormData({ ...formData, target_country: e.target.value.toUpperCase() })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                    placeholder="e.g., US, GB, CA"
                    maxLength={2}
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">2-letter country code for Luna proxy geo-targeting</p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Geo Rotation (Per-Trace)</h4>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">Configure country-level proxy rotation for each trace. Leave empty to use single target_country.</p>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Geo Pool
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newGeoCountry}
                      onChange={(e) => setNewGeoCountry(e.target.value.toUpperCase())}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const country = newGeoCountry.trim();
                          if (country.length === 2 && !geoPool.includes(country)) {
                            setGeoPool([...geoPool, country]);
                            if (geoStrategy === 'weighted' && !geoWeights[country]) {
                              setGeoWeights({...geoWeights, [country]: 5});
                            }
                            setNewGeoCountry('');
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                      placeholder="2-letter code (US, FR, etc.)"
                      maxLength={2}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const country = newGeoCountry.trim();
                        if (country.length === 2 && !geoPool.includes(country)) {
                          setGeoPool([...geoPool, country]);
                          if (geoStrategy === 'weighted' && !geoWeights[country]) {
                            setGeoWeights({...geoWeights, [country]: 5});
                          }
                          setNewGeoCountry('');
                        }
                      }}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-smooth flex items-center gap-2"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  {geoPool.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {geoPool.map(country => (
                        <div key={country} className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-lg">
                          <span className="text-sm font-medium">{country}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setGeoPool(geoPool.filter(c => c !== country));
                              const newWeights = {...geoWeights};
                              delete newWeights[country];
                              setGeoWeights(newWeights);
                            }}
                            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Rotation Strategy
                  </label>
                  <select
                    value={geoStrategy}
                    onChange={(e) => setGeoStrategy(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  >
                    <option value="weighted">Weighted</option>
                    <option value="round_robin">Round Robin</option>
                    <option value="random">Random</option>
                  </select>
                </div>

                {geoStrategy === 'weighted' && geoPool.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Weights
                    </label>
                    <div className="space-y-2">
                      {geoPool.map(country => (
                        <div key={country} className="flex items-center gap-3">
                          <span className="text-sm font-medium w-12">{country}</span>
                          <input
                            type="number"
                            value={geoWeights[country] || 1}
                            onChange={(e) => setGeoWeights({...geoWeights, [country]: parseInt(e.target.value) || 1})}
                            min="1"
                            className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">Higher weight = more frequent selection</p>
                  </div>
                )}
              </div>

              <div className="bg-info-50 dark:bg-info-900/20 border border-info-200 dark:border-info-800 rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Device Distribution</h4>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">Configure the percentage distribution of device types for User Agent rotation. Total must equal 100%.</p>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Mobile %
                    </label>
                    <input
                      type="number"
                      value={deviceDistribution.find(d => d.deviceCategory === 'mobile')?.weight || 60}
                      onChange={(e) => {
                        const weight = parseInt(e.target.value) || 0;
                        setDeviceDistribution(prev => 
                          prev.map(d => d.deviceCategory === 'mobile' ? { ...d, weight } : d)
                        );
                      }}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Desktop %
                    </label>
                    <input
                      type="number"
                      value={deviceDistribution.find(d => d.deviceCategory === 'desktop')?.weight || 30}
                      onChange={(e) => {
                        const weight = parseInt(e.target.value) || 0;
                        setDeviceDistribution(prev => 
                          prev.map(d => d.deviceCategory === 'desktop' ? { ...d, weight } : d)
                        );
                      }}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Tablet %
                    </label>
                    <input
                      type="number"
                      value={deviceDistribution.find(d => d.deviceCategory === 'tablet')?.weight || 10}
                      onChange={(e) => {
                        const weight = parseInt(e.target.value) || 0;
                        setDeviceDistribution(prev => 
                          prev.map(d => d.deviceCategory === 'tablet' ? { ...d, weight } : d)
                        );
                      }}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Total: {deviceDistribution.reduce((sum, d) => sum + d.weight, 0)}%
                  </span>
                  {deviceDistribution.reduce((sum, d) => sum + d.weight, 0) !== 100 && (
                    <span className="text-sm text-warning-600 dark:text-warning-400">
                      (Must equal 100%)
                    </span>
                  )}
                </div>

                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Default: Mobile 60%, Desktop 30%, Tablet 10%. Adjust for campaign-specific targeting.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Redirect Chain Step
                </label>
                <input
                  type="number"
                  value={formData.redirect_chain_step}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      redirect_chain_step: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  min="0"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Which step in the redirect chain to extract parameters from (0 = first step)</p>
              </div>

              <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Retry Configuration</h4>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">Configure how many times to retry if trace/fetch fails</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Retry Limit
                    </label>
                    <input
                      type="number"
                      value={formData.retry_limit}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          retry_limit: parseInt(e.target.value) || 3,
                        })
                      }
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                      min="0"
                      max="10"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Number of retry attempts if trace fails (0-10)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Retry Delay (ms)
                    </label>
                    <input
                      type="number"
                      value={formData.retry_delay_ms}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          retry_delay_ms: parseInt(e.target.value) || 2000,
                        })
                      }
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                      min="500"
                      max="10000"
                      step="500"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Delay between retries in milliseconds (500-10000ms)</p>
                  </div>
                </div>
              </div>

              <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-brand-600 dark:bg-brand-500 text-white rounded-full flex items-center justify-center font-bold">
                    AI
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Intelligent Tracer System</h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">Advanced redirect tracing with automatic detection</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Tracer Mode
                  </label>
                  <select
                    value={formData.tracer_mode}
                    onChange={(e) => setFormData({ ...formData, tracer_mode: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  >
                    <option value="auto">Auto (Intelligent Detection) - Recommended</option>
                    <option value="http_only">HTTP-Only (Fast, 2-5s)</option>
                    <option value="browser">Browser (Complex, 10-30s)</option>
                    <option value="anti_cloaking">Anti-Cloaking (Advanced, 15-60s)</option>
                    <option value="interactive">Interactive (Engagement, 20-40s)</option>
                    <option value="brightdata_browser">Bright Data Browser (Premium, 5-15s)</option>
                  </select>
                  <div className="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-brand-700 dark:text-brand-400">Auto:</span>
                      <span>Tries HTTP-only first, falls back to browser if needed. Best for most cases.</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-success-700 dark:text-success-400">HTTP-Only:</span>
                      <span>10-50x faster, 99% less bandwidth. Good for simple redirect chains.</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-warning-700 dark:text-warning-400">Browser:</span>
                      <span>Full JavaScript execution. Required for complex tracking (CPA networks, SPAs).</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-brand-700 dark:text-brand-400">Anti-Cloaking:</span>
                      <span>Stealth mode with bot detection bypass, popup tracking, and obfuscation decoding.</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-purple-700 dark:text-purple-400">Interactive:</span>
                      <span>Anti-cloaking + realistic session engagement (scrolls, mouse moves, waits) on final URL for minimal bandwidth.</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="font-semibold text-indigo-700 dark:text-indigo-400">Bright Data Browser:</span>
                      <span>Premium residential proxy with full browser automation. Auto-loads API key from settings, minimal bandwidth usage.</span>
                    </p>
                  </div>
                </div>

                {formData.tracer_mode === 'browser' && (
                  <div className="space-y-3 pt-2 border-t border-brand-200 dark:border-brand-700">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="block_resources"
                        checked={formData.block_resources}
                        onChange={(e) => setFormData({ ...formData, block_resources: e.target.checked })}
                        className="w-4 h-4 text-brand-600 border-neutral-300 dark:border-neutral-700 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="block_resources" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Block Resources (images, CSS, fonts) for faster tracing
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="extract_only"
                        checked={formData.extract_only}
                        onChange={(e) => setFormData({ ...formData, extract_only: e.target.checked })}
                        className="w-4 h-4 text-brand-600 border-neutral-300 dark:border-neutral-700 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="extract_only" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Extract Only (skip full page rendering)
                      </label>
                    </div>
                  </div>
                )}

                {(offer as any)?.tracer_detection_result?.mode_used && (
                  <div className="mt-3 p-3 bg-white dark:bg-neutral-850 rounded-lg border border-brand-300 dark:border-brand-700">
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1">Last Auto-Detection Result:</p>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                      <p>Mode Used: <span className="font-semibold text-neutral-900 dark:text-neutral-50">{(offer as any).tracer_detection_result.mode_used}</span></p>
                      <p>Reason: <span className="text-neutral-700 dark:text-neutral-300">{(offer as any).tracer_detection_result.detection_reason}</span></p>
                      <p>Timing: <span className="text-neutral-700 dark:text-neutral-300">{(offer as any).tracer_detection_result.timing_ms}ms</span></p>
                      <p>Bandwidth: <span className="text-neutral-700 dark:text-neutral-300">{(offer as any).tracer_detection_result.bandwidth_kb} KB</span></p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-emerald-600 dark:bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">
                    📍
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Location Header Extraction</h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">Extract parameters from location header of a specific redirect hop</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="extract_from_location_header"
                    checked={formData.extract_from_location_header}
                    onChange={(e) => setFormData({ ...formData, extract_from_location_header: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 border-neutral-300 dark:border-neutral-700 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="extract_from_location_header" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Enable Location Header Parameter Extraction
                  </label>
                </div>

                {formData.extract_from_location_header && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Extract from Hop (optional)
                    </label>
                    <input
                      type="number"
                      value={formData.location_extract_hop || ''}
                      onChange={(e) => setFormData({ ...formData, location_extract_hop: e.target.value ? parseInt(e.target.value) : null })}
                      min="1"
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none transition-smooth"
                      placeholder="Leave empty for last redirect"
                    />
                    <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                      {formData.location_extract_hop 
                        ? `Will extract params from location header of hop ${formData.location_extract_hop}` 
                        : 'Will extract params from location header of the last redirect (recommended for most cases)'}
                    </p>
                    <div className="mt-3 p-3 bg-emerald-100/50 dark:bg-emerald-900/30 rounded border border-emerald-200 dark:border-emerald-800">
                      <p className="text-xs text-emerald-900 dark:text-emerald-200">
                        <strong>Use Case:</strong> When the final destination URL with complete tracking parameters (like dclid, gad_source) 
                        is embedded in the location header of an intermediate redirect, rather than the final page URL itself.
                      </p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-2">
                        <strong>Example:</strong> DoubleClick redirects often have the actual landing page URL with all params in their location header.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-600 dark:bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                    🔌
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Provider Override</h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">Select a specific provider for this offer (overrides default rotation)</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Proxy Provider
                  </label>
                  {loadingProviders ? (
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading providers...</div>
                  ) : (
                    <select
                      value={formData.provider_id || ''}
                      onChange={(e) => setFormData({ ...formData, provider_id: e.target.value || null })}
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-400/20 focus:border-purple-500 dark:focus:border-purple-400 outline-none transition-smooth"
                    >
                      {hasLunaSettings ? (
                        <option value="">Luna Proxy (from Settings) - Default</option>
                      ) : (
                        <option value="">No Default Provider Configured</option>
                      )}
                      {providers.filter(p => p.enabled).length > 0 && (
                        <>
                          <option value="USE_ROTATION">🔄 Use Provider Rotation</option>
                          <optgroup label="Specific Providers">
                            {providers.filter(p => p.enabled).map(provider => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name} ({provider.provider_type})
                              </option>
                            ))}
                          </optgroup>
                        </>
                      )}
                    </select>
                  )}
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {!formData.provider_id
                      ? '🔒 Using Luna from Settings (default, single provider)'
                      : formData.provider_id === 'USE_ROTATION'
                      ? '🔄 Rotating between all enabled providers'
                      : '🔒 Using selected provider exclusively (no rotation)'
                    }
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Proxy Protocol
                  </label>
                  <select
                    value={formData.proxy_protocol || 'http'}
                    onChange={(e) => setFormData({ ...formData, proxy_protocol: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-400/20 focus:border-purple-500 dark:focus:border-purple-400 outline-none transition-smooth"
                  >
                    <option value="http">HTTP/HTTPS (Standard)</option>
                    <option value="socks5">SOCKS5 (TLS Fingerprint Bypass)</option>
                  </select>
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {formData.proxy_protocol === 'socks5'
                      ? '🔐 SOCKS5 bypasses TLS fingerprinting (recommended for cloaking protection)'
                      : '🌐 Standard HTTP proxy (faster, but may be detected by anti-cloaking)'
                    }
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Legacy Custom Referrer (fallback if no rotation referrers configured)
                </label>
                <input
                  type="text"
                  value={formData.custom_referrer}
                  onChange={(e) =>
                    setFormData({ ...formData, custom_referrer: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                  className="w-4 h-4 text-brand-600 border-neutral-300 dark:border-neutral-700 rounded focus:ring-brand-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Active
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-smooth font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth font-medium flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Offer'}
                </button>
              </div>
            </form>
          ) : activeTab === 'rotation' ? (
            <div className="p-6 space-y-6">
              <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
                <p className="text-sm text-brand-900 dark:text-brand-300">
                  Configure multiple tracking URLs and referrers with weighted rotation. URLs and referrers will be selected based on the rotation mode you choose.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Tracking URLs</h3>
                    <button
                      type="button"
                      onClick={addTrackingUrl}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add URL
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Rotation Mode
                    </label>
                    <select
                      value={formData.tracking_url_rotation_mode}
                      onChange={(e) => setFormData({ ...formData, tracking_url_rotation_mode: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
                    >
                      <option value="sequential">Sequential (rotates in order)</option>
                      <option value="random">Random (picks randomly)</option>
                      <option value="weighted-random">Weighted Random (probability based on weights)</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    {trackingUrls.map((entry, index) => (
                      <div key={index} className="bg-gray-50 dark:bg-dark-elevated p-4 rounded-lg border border-gray-200 dark:border-dark-border">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-5">
                            <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">URL</label>
                            <input
                              type="url"
                              value={entry.url}
                              onChange={(e) => updateTrackingUrl(index, 'url', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary text-sm"
                              placeholder="https://tracker.com/click?id=123"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">Label</label>
                            <input
                              type="text"
                              value={entry.label}
                              onChange={(e) => updateTrackingUrl(index, 'label', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary text-sm"
                              placeholder="Primary Tracker"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">Weight</label>
                            <input
                              type="number"
                              value={entry.weight}
                              onChange={(e) => updateTrackingUrl(index, 'weight', parseInt(e.target.value) || 1)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary text-sm"
                              min="1"
                              max="100"
                            />
                          </div>
                          <div className="col-span-2 flex items-end gap-2">
                            <button
                              type="button"
                              onClick={() => updateTrackingUrl(index, 'enabled', !entry.enabled)}
                              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                              title={entry.enabled ? 'Enabled' : 'Disabled'}
                            >
                              {entry.enabled ? (
                                <ToggleRight size={20} className="text-green-600" />
                              ) : (
                                <ToggleLeft size={20} className="text-gray-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTrackingUrl(index)}
                              className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {trackingUrls.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No tracking URLs configured. Legacy tracking_template will be used as fallback.
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-neutral-700 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">Referrers</h3>
                    <button
                      type="button"
                      onClick={addReferrer}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add Referrer
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                      Referrer Rotation Mode
                    </label>
                    <select
                      value={formData.referrer_rotation_mode}
                      onChange={(e) => setFormData({ ...formData, referrer_rotation_mode: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    >
                      <option value="sequential">Sequential (rotates in order)</option>
                      <option value="random">Random (picks randomly)</option>
                      <option value="weighted-random">Weighted Random (probability based on weights)</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    {referrers.map((entry, index) => (
                      <div key={index} className="bg-gray-50 dark:bg-neutral-800 p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                        <div className="grid grid-cols-12 gap-3 mb-3">
                          <div className="col-span-5">
                            <label className="block text-xs font-medium text-gray-600 dark:text-neutral-400 mb-1">Referrer URL</label>
                            <input
                              type="url"
                              value={entry.url}
                              onChange={(e) => updateReferrer(index, 'url', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 text-sm placeholder:text-gray-400 dark:placeholder:text-neutral-500"
                              placeholder="https://example.com/landing"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-neutral-400 mb-1">Label</label>
                            <input
                              type="text"
                              value={entry.label}
                              onChange={(e) => updateReferrer(index, 'label', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 text-sm placeholder:text-gray-400 dark:placeholder:text-neutral-500"
                              placeholder="Landing Page 1"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 dark:text-neutral-400 mb-1">Weight</label>
                            <input
                              type="number"
                              value={entry.weight}
                              onChange={(e) => updateReferrer(index, 'weight', parseInt(e.target.value) || 1)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 text-sm"
                              min="1"
                              max="100"
                            />
                          </div>
                          <div className="col-span-2 flex items-end gap-2">
                            <button
                              type="button"
                              onClick={() => updateReferrer(index, 'enabled', !entry.enabled)}
                              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                              title={entry.enabled ? 'Enabled' : 'Disabled'}
                            >
                              {entry.enabled ? (
                                <ToggleRight size={20} className="text-green-600" />
                              ) : (
                                <ToggleLeft size={20} className="text-gray-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeReferrer(index)}
                              className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-neutral-400 mb-1">
                            Apply to Hops (optional)
                            <span className="ml-1 text-gray-500 dark:text-neutral-500 font-normal">- Leave empty for all hops, or specify: 1,2,3</span>
                          </label>
                          <input
                            type="text"
                            value={entry.hops?.join(',') || ''}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              const hops = value ? value.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h) && h > 0) : [];
                              updateReferrer(index, 'hops', hops.length > 0 ? hops : undefined);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 text-sm placeholder:text-gray-400 dark:placeholder:text-neutral-500"
                            placeholder="e.g., 1,2,3 (empty = all hops)"
                          />
                        </div>
                      </div>
                    ))}
                    {referrers.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No referrers configured. Legacy custom_referrer will be used as fallback.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Rotation Config'}
                </button>
              </div>
            </div>
          ) : activeTab === 'parameters' ? (
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-300">
                  Control which parameters are included in the final suffix sent to Google. Use whitelist to only include specific parameters, or blacklist to exclude specific ones.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Filter Mode
                </label>
                <select
                  value={formData.param_filter_mode}
                  onChange={(e) => setFormData({ ...formData, param_filter_mode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Parameters (no filtering)</option>
                  <option value="whitelist">Whitelist (only include listed parameters)</option>
                  <option value="blacklist">Blacklist (exclude listed parameters)</option>
                </select>
              </div>

              {formData.param_filter_mode !== 'all' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                    Parameter Names
                  </label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newParamName}
                      onChange={(e) => setNewParamName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addParamToFilter())}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., gclid, fbclid, utm_source"
                    />
                    <button
                      type="button"
                      onClick={addParamToFilter}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {paramFilter.map((param) => (
                      <div
                        key={param}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-dark-elevated text-gray-700 dark:text-dark-text-primary rounded-lg border border-gray-300 dark:border-dark-border"
                      >
                        <span className="text-sm font-medium">{param}</span>
                        <button
                          type="button"
                          onClick={() => removeParamFromFilter(param)}
                          className="text-gray-500 dark:text-dark-text-secondary hover:text-red-600 dark:hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {paramFilter.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted py-2">
                        No parameters in {formData.param_filter_mode} yet. Add parameter names above.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Parameter Config'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-300">
                  Test your tracking template and configure which redirect step to extract parameters from.
                  Global proxy settings from the Settings page will be used automatically.
                  Make sure to save the offer after configuring the redirect chain step.
                </p>
              </div>

              <div className="space-y-4">

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                    Tracer Method
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setTracerMode('http_only')}
                      className={`px-3 py-2.5 rounded-lg font-medium transition-all border-2 text-sm ${
                        tracerMode === 'http_only'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary border-gray-300 dark:border-dark-border hover:border-blue-400'
                      }`}
                    >
                      HTTP-Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setTracerMode('browser')}
                      className={`px-3 py-2.5 rounded-lg font-medium transition-all border-2 text-sm ${
                        tracerMode === 'browser'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary border-gray-300 dark:border-dark-border hover:border-blue-400'
                      }`}
                    >
                      Browser
                    </button>
                    <button
                      type="button"
                      onClick={() => setTracerMode('anti_cloaking')}
                      className={`px-3 py-2.5 rounded-lg font-medium transition-all border-2 text-sm ${
                        tracerMode === 'anti_cloaking'
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary border-gray-300 dark:border-dark-border hover:border-orange-400'
                      }`}
                    >
                      🕵️ Anti-Cloak
                    </button>
                    <button
                      type="button"
                      onClick={() => setTracerMode('interactive')}
                      className={`px-3 py-2.5 rounded-lg font-medium transition-all border-2 text-sm ${
                        tracerMode === 'interactive'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary border-gray-300 dark:border-dark-border hover:border-purple-400'
                      }`}
                    >
                      🎬 Interactive
                    </button>
                    <button
                      type="button"
                      onClick={() => setTracerMode('brightdata_browser')}
                      className={`px-3 py-2.5 rounded-lg font-medium transition-all border-2 text-sm ${
                        tracerMode === 'brightdata_browser'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary border-gray-300 dark:border-dark-border hover:border-indigo-400'
                      }`}
                    >
                      🌐 Bright Data
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2">
                    {tracerMode === 'http_only' && '⚡ Fast HTTP requests only - No JS execution'}
                    {tracerMode === 'browser' && '🌐 Full browser rendering with JS execution & popup tracking'}
                    {tracerMode === 'anti_cloaking' && '🔍 Multi-engine: HTTP + Meta + JS + Form detection with proper headers'}
                    {tracerMode === 'interactive' && '🎬 Anti-cloaking + realistic session engagement (scrolls, mouse, waits)'}
                    {tracerMode === 'brightdata_browser' && '🌐 Premium residential proxy with browser automation - minimal bandwidth'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Advanced Settings
                </button>

                {showAdvanced && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Redirects
                        </label>
                        <input
                          type="number"
                          value={maxRedirects}
                          onChange={(e) => setMaxRedirects(parseInt(e.target.value))}
                          min="1"
                          max="50"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Timeout (ms)
                        </label>
                        <input
                          type="number"
                          value={timeout}
                          onChange={(e) => setTimeout(parseInt(e.target.value))}
                          min="5000"
                          max="60000"
                          step="1000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          User Agent (Optional)
                        </label>
                        <input
                          type="text"
                          value={userAgent}
                          onChange={(e) => setUserAgent(e.target.value)}
                          placeholder="Default Chrome UA"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="use_proxy"
                        checked={useProxy}
                        onChange={(e) => setUseProxy(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="use_proxy" className="text-sm font-medium text-gray-700">
                        Use Proxy Settings (from Settings page)
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={executeTrace}
                    disabled={tracing}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {tracing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Tracing...
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        Execute Trace
                      </>
                    )}
                  </button>

                  {traceResult && (
                    <button
                      type="button"
                      onClick={saveStepConfiguration}
                      disabled={selectedStepForSave === null}
                      className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Save size={18} />
                      {selectedStepForSave !== null ? `Use Step ${selectedStepForSave + 1}` : 'Select a Step First'}
                    </button>
                  )}
                </div>
              </div>

              {traceError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-medium text-red-900">Trace Error</p>
                    <p className="text-red-700 text-sm mt-1">{traceError}</p>
                  </div>
                </div>
              )}

              {traceResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 dark:text-neutral-100">Trace Results</h4>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-gray-400 dark:text-neutral-500" />
                        <span className="text-gray-600 dark:text-neutral-400">
                          {traceResult.total_timing_ms}ms
                        </span>
                      </div>
                      <span className="text-gray-600 dark:text-neutral-400">
                        {traceResult.total_steps} steps
                      </span>
                      {(traceResult as any).bandwidth_bytes && (
                        <span className="text-gray-600 dark:text-neutral-400 text-xs font-medium">
                          📊 {((traceResult as any).bandwidth_bytes).toLocaleString()} B
                        </span>
                      )}
                      {(traceResult as any).selected_geo && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold">
                          🌍 {(traceResult as any).selected_geo.toUpperCase()}
                        </span>
                      )}
                      {(traceResult as any).total_popups > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          {(traceResult as any).total_popups} popups
                        </span>
                      )}
                    </div>
                  </div>

                  {traceResult.user_agent && (
                    <div className="bg-white dark:bg-neutral-850 border border-gray-200 dark:border-neutral-700 rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-2">User Agent (full)</div>
                      <div className="flex items-start gap-2">
                        <code className="flex-1 bg-gray-50 dark:bg-neutral-800 rounded px-3 py-2 text-xs font-mono text-gray-900 dark:text-neutral-100 break-all">
                          {traceResult.user_agent}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(traceResult.user_agent || '')}
                          className="p-2 text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {traceResult.chain.map((step, index) => {
                      const isExpanded = expandedSteps.has(index);
                      const isSavedStep = formData.redirect_chain_step === index;

                      return (
                        <div
                          key={index}
                          className={`border-2 rounded-lg transition-all ${
                            selectedStepForSave === index
                              ? 'border-green-500 bg-green-50'
                              : isSavedStep
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleStep(index)}
                            className="w-full p-4 text-left"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-semibold text-gray-900">
                                    Step {index + 1}
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(step.status)}`}>
                                    {step.status || 'N/A'}
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${getRedirectTypeColor(step.redirect_type)}`}>
                                    {step.redirect_type}
                                  </span>
                                  {selectedStepForSave === index && (
                                    <span className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                                      SELECTED
                                    </span>
                                  )}
                                  {isSavedStep && (
                                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                                      SAVED
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <ExternalLink size={14} className="text-gray-400 flex-shrink-0" />
                                  <span className="text-gray-700 truncate font-mono text-xs">
                                    {step.url}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(step.url);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                                {step.error && (
                                  <div className="mt-2 text-xs text-red-600 flex items-start gap-1">
                                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                                    <span>{step.error}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStepForSave(selectedStepForSave === index ? null : index);
                                  }}
                                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                    selectedStepForSave === index
                                      ? 'bg-green-600 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {selectedStepForSave === index ? 'Selected' : 'Select'}
                                </button>
                                {isExpanded ? (
                                  <ChevronUp size={20} className="text-gray-400" />
                                ) : (
                                  <ChevronDown size={20} className="text-gray-400" />
                                )}
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 border-t border-gray-200">
                              {step.error && (
                                <div className="bg-red-50 border border-red-200 rounded p-3">
                                  <p className="text-sm font-semibold text-red-900 mb-1">Error</p>
                                  <p className="text-sm text-red-700">{step.error}</p>
                                </div>
                              )}

                              {step.params && Object.keys(step.params).length > 0 && (
                                <div>
                                  <p className="text-sm font-semibold text-gray-700 mb-2">
                                    Parameters ({Object.keys(step.params).length})
                                  </p>
                                  <div className="bg-gray-50 rounded p-3 space-y-1 max-h-40 overflow-y-auto">
                                    {Object.entries(step.params).map(([key, value]) => (
                                      <div key={key} className="flex gap-3 text-xs font-mono">
                                        <span className="font-semibold text-gray-700 min-w-[120px]">
                                          {key}:
                                        </span>
                                        <span className="text-gray-900 break-all">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {step.headers && Object.keys(step.headers).length > 0 && (
                                <div>
                                  <p className="text-sm font-semibold text-gray-700 mb-2">
                                    Headers
                                  </p>
                                  <div className="bg-gray-50 rounded p-3 space-y-1 max-h-40 overflow-y-auto">
                                    {Object.entries(step.headers).slice(0, 5).map(([key, value]) => (
                                      <div key={key} className="flex gap-3 text-xs font-mono">
                                        <span className="font-semibold text-gray-700 min-w-[120px]">
                                          {key}:
                                        </span>
                                        <span className="text-gray-900 break-all truncate">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {index < traceResult.chain.length - 1 && (
                            <div className="flex justify-center py-2">
                              <ArrowRight size={20} className="text-blue-500 transform rotate-90" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {(traceResult as any).popup_chains && (traceResult as any).popup_chains.length > 0 && (
                    <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                      <h5 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <span>🪟 Popup Windows Detected ({(traceResult as any).popup_chains.length})</span>
                      </h5>
                      <div className="space-y-3">
                        {(traceResult as any).popup_chains.map((popup: any, idx: number) => (
                          <div key={idx} className="bg-white p-3 rounded border border-green-300">
                            <div className="text-sm space-y-1">
                              <div className="font-medium text-gray-900">Popup #{popup.popup_index}</div>
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Opened from:</span>
                                <p className="font-mono mt-1 break-all">{popup.opener_url}</p>
                              </div>
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Popup URL:</span>
                                <p className="font-mono mt-1 break-all text-green-700">{popup.final_url}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      {traceResult.chain[traceResult.chain.length - 1].redirect_type === 'final' ? (
                        <CheckCircle className="text-green-600" size={20} />
                      ) : (
                        <XCircle className="text-red-600" size={20} />
                      )}
                      <span className="font-semibold text-gray-900">Final Destination:</span>
                    </div>
                    <code className="block bg-white px-3 py-2 rounded text-sm font-mono text-gray-900 break-all">
                      {traceResult.final_url}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
