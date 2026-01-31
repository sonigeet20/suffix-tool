import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Database, TrendingUp, Settings as SettingsIcon, RefreshCw, Zap, Plus, X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface QueueStats {
  offer_name: string;
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
}

interface BucketInventory {
  offer_name: string;
  total_suffixes: number;
  unused_suffixes: number;
  used_suffixes: number;
  traced_count: number;
  zero_click_count: number;
}

interface DailyStats {
  offer_name: string;
  stats_date: string;
  total_clicks: number;
  unique_landing_pages: number;
  repeat_ratio: number;
}

interface TraceOverride {
  id: string;
  account_id: string;
  offer_name: string;
  enabled: boolean;
  traces_per_day: number | null;
  speed_multiplier: number | null;
  trace_also_on_webhook: boolean;
}

interface CampaignMapping {
  id: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  offer_name: string;
  is_active: boolean;
  auto_created: boolean;
}

interface TrackierCampaign {
  campaignId: number;
  campaignName: string;
  webhookUrl: string;
  webhookUrlWithParams: string;
  trackingTemplate: string;
  redirectType: string;
  instructions: string[];
}

interface MappingWithTrackier extends CampaignMapping {
  trackier?: TrackierCampaign | null;
}

export function V5WebhookManager() {
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats[]>([]);
  const [bucketInventory, setBucketInventory] = useState<BucketInventory[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [overrides, setOverrides] = useState<TraceOverride[]>([]);
  const [campaigns, setCampaigns] = useState<MappingWithTrackier[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<MappingWithTrackier[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string>('');
  const [offerOptions, setOfferOptions] = useState<string[]>([]);
  const [offerSearch, setOfferSearch] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  
  // Expanded mappings state
  const [expandedMappings, setExpandedMappings] = useState<Set<string>>(new Set());
  
  // Search and pagination for mappings
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [loadingMappings, setLoadingMappings] = useState(false);

  
  // Create form state
  const [formData, setFormData] = useState({
    account_id: '',
    google_campaign_id: '',
    offer_name: '',
    campaign_name: ''
  });

  // Load all mappings on mount
  useEffect(() => {
    loadAllMappings();
  }, []);

  // Filter and paginate campaigns
  useEffect(() => {
    let filtered = allCampaigns;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.offer_name.toLowerCase().includes(query) ||
        c.campaign_id.toLowerCase().includes(query) ||
        c.campaign_name?.toLowerCase().includes(query) ||
        c.account_id.toLowerCase().includes(query)
      );
    }

    // Active/Inactive filter
    if (filterActive !== 'all') {
      filtered = filtered.filter(c => 
        filterActive === 'active' ? c.is_active : !c.is_active
      );
    }

    setCampaigns(filtered);
    setCurrentPage(1); // Reset to first page when filter changes
  }, [searchQuery, filterActive, allCampaigns]);

  const loadAllMappings = async () => {
    setLoadingMappings(true);
    try {
      const [campaignRes, trackierRes, overridesRes] = await Promise.all([
        supabase
          .from('v5_campaign_offer_mapping')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('v5_trackier_campaigns')
          .select('*'),
        supabase
          .from('v5_trace_overrides')
          .select('*')
      ]);

      // Index trackier records both by mapping_id and by offer_name
      const trackierByMapping: Record<string, any> = {};
      const trackierByOffer: Record<string, any> = {};
      (trackierRes.data || []).forEach((t) => {
        if (t.mapping_id) {
          trackierByMapping[t.mapping_id] = t;
        }
        // Also index by offer_name as fallback
        if (t.offer_name && !trackierByOffer[t.offer_name]) {
          trackierByOffer[t.offer_name] = t;  // Keep first/most recent
        }
      });

      const overridesMapLocal: Record<string, TraceOverride> = {};
      (overridesRes.data || []).forEach((o: any) => {
        const key = `${o.account_id}||${o.offer_name}`;
        overridesMapLocal[key] = o;
      });
      setOverrides(overridesRes.data || []);

      if (!campaignRes.error && campaignRes.data) {
        const enriched = campaignRes.data.map((mapping: any) => {
          // First try by mapping_id, then fallback to offer_name
          const trackier = trackierByMapping[mapping.id] || trackierByOffer[mapping.offer_name];
          return {
            ...mapping,
            trackier: trackier ? {
              campaignId: trackier.trackier_campaign_id,
              campaignName: trackier.trackier_campaign_name,
              webhookUrl: trackier.webhook_url,
              webhookUrlWithParams: `${trackier.webhook_url}?account_id=${mapping.account_id}&campaign_id={p1}&offer_name=${mapping.offer_name}&suffix={transaction_id}`,
              trackingTemplate: trackier.tracking_template,
              redirectType: trackier.redirect_type,
              instructions: []
            } : null
          } as MappingWithTrackier;
        });
        setAllCampaigns(enriched);
      }
    } catch (error) {
      console.error('Load mappings error:', error);
    } finally {
      setLoadingMappings(false);
    }
  };

  // Lazy offer search (avoid preloading all offers)
  useEffect(() => {
    let active = true;
    const fetchOffers = async () => {
      if (!offerSearch || offerSearch.length < 2) {
        setOfferOptions([]);
        return;
      }
      setOfferLoading(true);
      try {
        const { data, error } = await supabase
          .from('offers')
          .select('offer_name')
          .ilike('offer_name', `%${offerSearch}%`)
          .limit(20);
        if (error) throw error;
        if (!active) return;
        const unique = Array.from(new Set((data || []).map((o: any) => o.offer_name)));
        setOfferOptions(unique);
      } catch (err) {
        if (active) console.error('Failed to search offers', err);
      } finally {
        if (active) setOfferLoading(false);
      }
    };
    fetchOffers();
    return () => { active = false; };
  }, [offerSearch]);

  const loadData = async () => {
    if (!accountId.trim()) {
      alert('Please enter an Account ID');
      return;
    }

    setLoading(true);
    try {
      // Load queue stats
      const { data: qData, error: qError } = await supabase.rpc('v5_get_queue_stats', {
        p_account_id: accountId
      });
      if (!qError && qData) setQueueStats(qData);

      // Load bucket inventory
      const { data: bData, error: bError } = await supabase.rpc('v5_get_bucket_inventory', {
        p_account_id: accountId
      });
      if (!bError && bData) setBucketInventory(bData);

      // Load daily stats (today + yesterday)
      const { data: dData, error: dError } = await supabase
        .from('v5_daily_offer_stats')
        .select('*')
        .eq('account_id', accountId)
        .order('stats_date', { ascending: false })
        .limit(10);
      if (!dError && dData) setDailyStats(dData);

      // Load overrides
      const { data: oData, error: oError } = await supabase
        .from('v5_trace_overrides')
        .select('*')
        .eq('account_id', accountId);
      if (!oError && oData) setOverrides(oData);

      // Load campaign mappings with Trackier details
      const { data: cData, error: cError } = await supabase
        .from('v5_campaign_offer_mapping')
        .select('*')
        .eq('account_id', accountId)
        .order('offer_name', { ascending: true });
      
      if (!cError && cData) {
        // Enrich with Trackier campaign details
        const enriched = await Promise.all(
          cData.map(async (mapping) => {
            // First try: query by mapping_id (new properly-linked records)
            let { data: trackier } = await supabase
              .from('v5_trackier_campaigns')
              .select('*')
              .eq('mapping_id', mapping.id)
              .maybeSingle();
            
            // Fallback: if not found, query by offer_name (for old broken records)
            if (!trackier) {
              const { data: trackierByOffer } = await supabase
                .from('v5_trackier_campaigns')
                .select('*')
                .eq('offer_name', mapping.offer_name)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              trackier = trackierByOffer;
            }
            
            return {
              ...mapping,
              trackier: trackier ? {
                campaignId: trackier.trackier_campaign_id,
                campaignName: trackier.trackier_campaign_name,
                webhookUrl: trackier.webhook_url,
                webhookUrlWithParams: `${trackier.webhook_url}?account_id=${accountId}&campaign_id={p1}&offer_name=${mapping.offer_name}&suffix={transaction_id}`,
                trackingTemplate: trackier.tracking_template,
                redirectType: trackier.redirect_type,
                instructions: []
              } : null
            };
          })
        );
        setCampaigns(enriched);
      }
    } catch (error) {
      console.error('Load error:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const clearBucket = async (offerName: string) => {
    if (!confirm(`Are you sure you want to clear all suffixes for offer "${offerName}"? This cannot be undone and will allow a fresh zero-click collection.`)) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('v5_suffix_bucket')
        .delete()
        .eq('account_id', accountId)
        .eq('offer_name', offerName);

      if (error) throw error;

      alert(`Successfully cleared all suffixes for ${offerName}`);
      await loadData(); // Reload data
    } catch (error: any) {
      console.error('Clear bucket error:', error);
      alert(`Failed to clear bucket: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const targetAccountId = formData.account_id || accountId;
    
    if (!targetAccountId.trim() || !formData.google_campaign_id || !formData.offer_name) {
      alert('Please fill in all required fields');
      return;
    }

    setCreateLoading(true);
    try {
      // Get Trackier API credentials from settings
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to create mappings');
        return;
      }

      const { data: settings } = await supabase
        .from('settings')
        .select('trackier_api_key, trackier_api_url')
        .eq('user_id', user.id)
        .single();

      if (!settings?.trackier_api_key) {
        alert('Please configure Trackier API key in Settings first');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/v5-create-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: targetAccountId,
          google_campaign_id: formData.google_campaign_id,
          offer_name: formData.offer_name,
          campaign_name: formData.campaign_name || `V5-${formData.offer_name}-GA${formData.google_campaign_id}`,
          trackier_api_key: settings.trackier_api_key,
          trackier_api_url: settings.trackier_api_url || 'https://api.trackier.com'
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        alert(`Failed to create mapping: ${result.error || 'Unknown error'}`);
        return;
      }

      alert('✅ Mapping created successfully!\n\nNext steps:\n1. Copy Tracking Template to Google Ads\n2. Copy Postback URL to Trackier campaign');
      
      // Reset form and close modal
      setFormData({ account_id: '', google_campaign_id: '', offer_name: '', campaign_name: '' });
      setOfferSearch('');
      setShowCreateModal(false);
      
      // Reload all mappings
      await loadAllMappings();
      
      // If account ID filter is active, reload its stats too
      if (accountId) {
        await loadData();
      }
    } catch (error: any) {
      console.error('Create mapping error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const toggleMappingExpanded = (mappingId: string) => {
    const newExpanded = new Set(expandedMappings);
    if (newExpanded.has(mappingId)) {
      newExpanded.delete(mappingId);
    } else {
      newExpanded.add(mappingId);
    }
    setExpandedMappings(newExpanded);
  };

  const deleteMapping = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this mapping? This cannot be undone.')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('v5_campaign_offer_mapping')
        .delete()
        .eq('id', mappingId);
      
      if (error) throw error;
      alert('✅ Mapping deleted successfully');
      await loadAllMappings();
    } catch (err: any) {
      console.error('Delete mapping error:', err);
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="text-brand-600 dark:text-brand-400" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">V5 Webhook System</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Auto-create Trackier campaigns with 200_hrf redirects and manage mappings
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            Create Mapping
          </button>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="Enter Account ID (e.g., 1234567890)"
            className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Database size={16} />
                Load Data
              </>
            )}
          </button>
          <button
            onClick={loadAllMappings}
            disabled={loadingMappings}
            title="Refresh all mappings (useful after script auto-setup)"
            className="flex items-center gap-2 px-4 py-2 bg-neutral-600 dark:bg-neutral-500 text-white rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth disabled:opacity-50"
          >
            {loadingMappings ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Sync Mappings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Create Mapping Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Create V5 Mapping</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-smooth"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateMapping} className="p-6 space-y-4">
              <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4 space-y-2">
                <div>
                  <label className="block text-sm font-medium text-brand-900 dark:text-brand-200 mb-1">Account ID *</label>
                  <input
                    type="text"
                    value={formData.account_id || accountId}
                    onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                    placeholder="1234567890"
                    required
                    className="w-full px-4 py-2 border border-brand-200 dark:border-brand-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  />
                </div>
                <p className="text-xs text-brand-700 dark:text-brand-400">
                  This will create a Trackier campaign with redirectType: 200_hrf and auto-generate tracking URLs
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Google Ads Campaign ID *
                </label>
                <input
                  type="text"
                  value={formData.google_campaign_id}
                  onChange={(e) => setFormData({ ...formData, google_campaign_id: e.target.value })}
                  placeholder="1234567890"
                  required
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  The campaign ID from Google Ads (not Trackier)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Offer Name *
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={offerSearch}
                    onChange={(e) => setOfferSearch(e.target.value)}
                    placeholder="Type 2+ chars to search offers"
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  />
                  <div className="max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                    {offerLoading && (
                      <div className="px-3 py-2 text-sm text-neutral-500">Searching...</div>
                    )}
                    {!offerLoading && offerOptions.length === 0 && offerSearch.length >= 2 && (
                      <div className="px-3 py-2 text-sm text-neutral-500">No offers found</div>
                    )}
                    {offerOptions.map((offer) => (
                      <button
                        type="button"
                        key={offer}
                        onClick={() => {
                          setFormData({ ...formData, offer_name: offer });
                          setOfferSearch(offer);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${formData.offer_name === offer ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-neutral-800 dark:text-neutral-200'}`}
                      >
                        {offer}
                      </button>
                    ))}
                  </div>
                  <input
                    type="hidden"
                    value={formData.offer_name}
                    required
                    onChange={() => {}}
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Search and select an offer (no full preload)
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Campaign Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.campaign_name}
                  onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
                  placeholder={`V5-${formData.offer_name || 'Offer'}-GA${formData.google_campaign_id || 'ID'}`}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Auto-generated if left empty
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-smooth"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 px-4 py-2 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 transition-smooth disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Queue Stats */}
      {queueStats.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
              <Activity size={20} />
              Webhook Queue Status
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-850">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Offer</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Pending</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Processing</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Completed</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {queueStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-50">{stat.offer_name}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{stat.pending_count}</td>
                    <td className="px-6 py-4 text-sm text-right text-warning-600 dark:text-warning-400">{stat.processing_count}</td>
                    <td className="px-6 py-4 text-sm text-right text-success-600 dark:text-success-400">{stat.completed_count}</td>
                    <td className="px-6 py-4 text-sm text-right text-error-600 dark:text-error-400">{stat.failed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bucket Analytics Summary */}
      {bucketInventory.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg p-4 text-white">
            <div className="text-sm opacity-90 mb-1">Total Suffixes</div>
            <div className="text-3xl font-bold">{bucketInventory.reduce((sum, inv) => sum + inv.total_suffixes, 0)}</div>
          </div>
          <div className="bg-gradient-to-br from-success-500 to-success-600 rounded-lg p-4 text-white">
            <div className="text-sm opacity-90 mb-1">Unused (Available)</div>
            <div className="text-3xl font-bold">{bucketInventory.reduce((sum, inv) => sum + inv.unused_suffixes, 0)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
            <div className="text-sm opacity-90 mb-1">Zero-Click</div>
            <div className="text-3xl font-bold">{bucketInventory.reduce((sum, inv) => sum + inv.zero_click_count, 0)}</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 text-white">
            <div className="text-sm opacity-90 mb-1">Traced</div>
            <div className="text-3xl font-bold">{bucketInventory.reduce((sum, inv) => sum + inv.traced_count, 0)}</div>
          </div>
        </div>
      )}

      {/* Bucket Inventory */}
      {bucketInventory.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
              <Database size={20} />
              Suffix Bucket Inventory (Detailed)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-850">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Offer</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Unused</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Used</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Traced</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Zero-Click</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {bucketInventory.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-50">{inv.offer_name}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{inv.total_suffixes}</td>
                    <td className="px-6 py-4 text-sm text-right text-success-600 dark:text-success-400">{inv.unused_suffixes}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-500 dark:text-neutral-500">{inv.used_suffixes}</td>
                    <td className="px-6 py-4 text-sm text-right text-brand-600 dark:text-brand-400">{inv.traced_count}</td>
                    <td className="px-6 py-4 text-sm text-right text-purple-600 dark:text-purple-400">{inv.zero_click_count}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      <button
                        onClick={() => clearBucket(inv.offer_name)}
                        disabled={loading}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-danger-600 hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Clear all suffixes for this offer"
                      >
                        <Trash2 size={14} />
                        Clear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Stats (Repeat Ratio) */}
      {dailyStats.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
              <TrendingUp size={20} />
              Daily Statistics
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-850">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Offer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Clicks</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Unique LPs</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Repeat Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {dailyStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-50">{stat.offer_name}</td>
                    <td className="px-6 py-4 text-sm text-neutral-600 dark:text-neutral-400">{new Date(stat.stats_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{stat.total_clicks}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{stat.unique_landing_pages}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      {stat.repeat_ratio !== null && stat.repeat_ratio !== undefined ? (
                        <span className={`px-3 py-1 rounded-full font-semibold ${
                          stat.repeat_ratio < 0.5 ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' :
                          stat.repeat_ratio < 0.8 ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' :
                          'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
                        }`}>
                          {stat.repeat_ratio.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-500 italic">calculating...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trace Overrides */}
      {overrides.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
              <SettingsIcon size={20} />
              Trace Overrides
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-850">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Offer</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Enabled</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Traces/Day</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Speed x</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Trace on Webhook</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {overrides.map((override) => (
                  <tr key={override.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-850/50">
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      <div className="font-mono text-xs text-neutral-500">{override.account_id}</div>
                      {override.offer_name}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${override.enabled ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                        {override.enabled ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{override.traces_per_day ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-right text-neutral-600 dark:text-neutral-400">{override.speed_multiplier ?? '-'}</td>
                    <td className="px-6 py-4 text-center text-sm text-neutral-600 dark:text-neutral-400">{override.trace_also_on_webhook ? '✓' : '-'}</td>
                    <td className="px-6 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">View/edit in mapping card</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign Mappings */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Campaign Mappings & Trackier Integration</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">All V5 mappings with Trackier campaigns</p>
            </div>
            <button
              onClick={() => loadAllMappings()}
              disabled={loadingMappings}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-smooth disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingMappings ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          
          {/* Search and Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by offer, campaign ID, account..."
              className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-brand-500/20 outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterActive('all')}
                className={`px-3 py-2 text-sm rounded-lg transition-smooth ${filterActive === 'all' ? 'bg-brand-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
              >
                All ({allCampaigns.length})
              </button>
              <button
                onClick={() => setFilterActive('active')}
                className={`px-3 py-2 text-sm rounded-lg transition-smooth ${filterActive === 'active' ? 'bg-success-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
              >
                Active ({allCampaigns.filter(c => c.is_active).length})
              </button>
              <button
                onClick={() => setFilterActive('inactive')}
                className={`px-3 py-2 text-sm rounded-lg transition-smooth ${filterActive === 'inactive' ? 'bg-neutral-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
              >
                Inactive ({allCampaigns.filter(c => !c.is_active).length})
              </button>
            </div>
          </div>
        </div>

        {loadingMappings ? (
          <div className="p-12 text-center">
            <RefreshCw size={32} className="animate-spin mx-auto text-brand-500 mb-3" />
            <p className="text-neutral-600 dark:text-neutral-400">Loading mappings...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <Zap size={48} className="mx-auto text-neutral-400 mb-3" />
            <p className="text-neutral-600 dark:text-neutral-400">
              {searchQuery || filterActive !== 'all' ? 'No mappings match your filters' : 'No mappings created yet'}
            </p>
            {!searchQuery && filterActive === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-smooth"
              >
                Create Your First Mapping
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Hierarchical View: Offer → Account → Campaigns */}
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {(() => {
                // Group campaigns by offer, then by account
                const groupedByOffer = campaigns.reduce((acc, mapping) => {
                  if (!acc[mapping.offer_name]) {
                    acc[mapping.offer_name] = {};
                  }
                  if (!acc[mapping.offer_name][mapping.account_id]) {
                    acc[mapping.offer_name][mapping.account_id] = [];
                  }
                  acc[mapping.offer_name][mapping.account_id].push(mapping);
                  return acc;
                }, {} as Record<string, Record<string, any[]>>);

                return Object.entries(groupedByOffer).map(([offerName, accountsMap]) => (
                  <div key={offerName} className="border-b border-neutral-200 dark:border-neutral-800">
                    {/* OFFER LEVEL */}
                    <div className="bg-brand-50 dark:bg-brand-900/10 px-6 py-4 border-b border-brand-200 dark:border-brand-800/50">
                      <h3 className="text-lg font-bold text-brand-900 dark:text-brand-100">{offerName}</h3>
                      <p className="text-xs text-brand-700 dark:text-brand-300 mt-1">{Object.keys(accountsMap).length} account(s) using this offer</p>
                    </div>

                    {Object.entries(accountsMap).map(([accountId, mappingsForAccount]) => {
                      const bucketSize = bucketInventory.find(b => b.offer_name === offerName)?.total_suffixes || 0;
                      const expandedAccountKey = `${offerName}|${accountId}`;
                      const isAccountExpanded = expandedMappings.has(expandedAccountKey);
                      
                      return (
                        <div key={accountId} className="border-b border-neutral-200 dark:border-neutral-800">
                          {/* ACCOUNT LEVEL */}
                          <div 
                            className="px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-850/50 cursor-pointer transition-smooth border-l-4 border-l-brand-400 dark:border-l-brand-600"
                            onClick={() => {
                              if (isAccountExpanded) {
                                expandedMappings.delete(expandedAccountKey);
                              } else {
                                expandedMappings.add(expandedAccountKey);
                              }
                              setExpandedMappings(new Set(expandedMappings));
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0">
                                  {isAccountExpanded ? (
                                    <ChevronDown size={20} className="text-brand-600 dark:text-brand-400" />
                                  ) : (
                                    <ChevronRight size={20} className="text-neutral-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-base font-semibold text-neutral-900 dark:text-neutral-50">Account: {accountId}</span>
                                    <span className="px-2 py-1 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                      {mappingsForAccount.length} campaign(s)
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center gap-4 text-sm">
                                    <span className="text-neutral-600 dark:text-neutral-400">
                                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">Bucket Size:</span> {bucketSize} suffix{bucketSize !== 1 ? 'es' : ''}
                                    </span>
                                    <span className="text-neutral-600 dark:text-neutral-400">
                                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">Health:</span> {mappingsForAccount.filter(m => m.is_active).length}/{mappingsForAccount.length} active
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400">Click to expand</div>
                            </div>
                          </div>

                          {/* CAMPAIGNS LEVEL */}
                          {isAccountExpanded && (
                            <div className="bg-neutral-50 dark:bg-neutral-900/50 pl-12 border-l-4 border-l-neutral-300 dark:border-l-neutral-700">
                              {mappingsForAccount.map((mapping, idx) => {
                                const isExpanded = expandedMappings.has(mapping.id);
                                return (
                                  <div key={mapping.id} className={`p-4 ${idx !== mappingsForAccount.length - 1 ? 'border-b border-neutral-200 dark:border-neutral-800' : ''}`}>
                                    {/* Campaign Summary */}
                                    <div 
                                      className="flex items-center justify-between cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 -m-4 p-4 rounded transition-smooth"
                                      onClick={() => toggleMappingExpanded(mapping.id)}
                                    >
                                      <div className="flex items-center gap-3 flex-1">
                                        <div className="flex-shrink-0">
                                          {isExpanded ? (
                                            <ChevronDown size={18} className="text-brand-600 dark:text-brand-400" />
                                          ) : (
                                            <ChevronRight size={18} className="text-neutral-400" />
                                          )}
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-3">
                                            <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-50">Campaign {mapping.campaign_id}</span>
                                            <span className="text-xs text-neutral-500 dark:text-neutral-400">{mapping.campaign_name}</span>
                                          </div>
                                          <div className="mt-2 flex items-center gap-3 text-sm">
                                            {mapping.trackier && (
                                              <span className="font-mono text-brand-600 dark:text-brand-400">
                                                ✓ Trackier #{mapping.trackier.campaignId}
                                              </span>
                                            )}
                                            {!mapping.trackier && (
                                              <span className="text-warning-600 dark:text-warning-400">
                                                ⚠ No Trackier campaign
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`px-3 py-1 text-xs rounded-full ${mapping.is_active ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                                          {mapping.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Campaign Details - Expanded */}
                                    {isExpanded && (
                                      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                                        {mapping.trackier && (
                                          <div className="space-y-3">
                                            {/* Tracking Template */}
                                            <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
                                              <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Tracking Template</label>
                                                <button
                                                  onClick={() => copyToClipboard(mapping.trackier?.trackingTemplate || '', `template-${mapping.id}`)}
                                                  className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                                                >
                                                  {copiedField === `template-${mapping.id}` ? '✓ Copied' : 'Copy'}
                                                </button>
                                              </div>
                                              <code className="text-xs text-neutral-600 dark:text-neutral-400 break-all">{mapping.trackier?.trackingTemplate}</code>
                                            </div>

                                            {/* Postback URL */}
                                            <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
                                              <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Postback URL</label>
                                                <button
                                                  onClick={() => copyToClipboard(mapping.trackier?.webhookUrlWithParams || '', `webhook-${mapping.id}`)}
                                                  className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                                                >
                                                  {copiedField === `webhook-${mapping.id}` ? '✓ Copied' : 'Copy'}
                                                </button>
                                              </div>
                                              <code className="text-xs text-neutral-600 dark:text-neutral-400 break-all">{mapping.trackier?.webhookUrlWithParams}</code>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {!mapping.trackier && (
                                          <div className="bg-warning-50 dark:bg-warning-900/20 rounded-lg p-3 border border-warning-200 dark:border-warning-800">
                                            <p className="text-sm text-warning-900 dark:text-warning-300">
                                              Click the "Create Trackier" button below to set up the campaign
                                            </p>
                                          </div>
                                        )}

                                        {/* Delete Button */}
                                        <button
                                          onClick={() => deleteMapping(mapping.id)}
                                          className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-danger-100 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400 hover:bg-danger-200 dark:hover:bg-danger-900/40"
                                        >
                                          <Trash2 size={14} />
                                          Delete Campaign
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
            
            {/* Pagination */}
            {campaigns.length > itemsPerPage && (
              <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, campaigns.length)} of {campaigns.length} mappings
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.ceil(campaigns.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 text-sm rounded-lg transition-smooth ${currentPage === page ? 'bg-brand-600 text-white' : 'bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'}`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(campaigns.length / itemsPerPage), p + 1))}
                      disabled={currentPage === Math.ceil(campaigns.length / itemsPerPage)}
                      className="px-3 py-2 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && queueStats.length === 0 && bucketInventory.length === 0 && (
        <div className="bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-lg p-8 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">Enter an Account ID and click "Load Data" to view V5 system status</p>
        </div>
      )}
    </div>
  );
}
