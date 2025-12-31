import { useEffect, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, RefreshCw, TrendingUp, Link2, Calendar, Clock, Globe, Monitor, Smartphone, Tablet, Bot } from 'lucide-react';
import { supabase, SuffixRequest, Offer, OfferStatistics, UrlTrace } from '../lib/supabase';
import SearchBar from './ui/SearchBar';
import FilterDropdown from './ui/FilterDropdown';
import Pagination from './ui/Pagination';

interface OfferWithStats {
  offer: Offer;
  stats: OfferStatistics | null;
  recentRequests: SuffixRequest[];
  urlTraces: UrlTrace[];
}

export default function Analytics() {
  const [offersWithStats, setOffersWithStats] = useState<OfferWithStats[]>([]);
  const [expandedOffers, setExpandedOffers] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, 'suffix' | 'traces'>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data: offers, error: offersError } = await supabase
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false });

      if (offersError) throw offersError;

      const offersData: OfferWithStats[] = await Promise.all(
        (offers || []).map(async (offer) => {
          const { data: stats } = await supabase
            .from('offer_statistics')
            .select('*')
            .eq('offer_id', offer.id)
            .maybeSingle();

          const { data: requests } = await supabase
            .from('suffix_requests')
            .select('*')
            .eq('offer_id', offer.id)
            .order('requested_at', { ascending: false })
            .limit(10);

          const { data: traces } = await supabase
            .from('url_traces')
            .select('*')
            .eq('offer_id', offer.id)
            .order('visited_at', { ascending: false })
            .limit(100);

          return {
            offer,
            stats: stats || null,
            recentRequests: requests || [],
            urlTraces: traces || [],
          };
        })
      );

      setOffersWithStats(offersData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOffer = (offerId: string) => {
    const newExpanded = new Set(expandedOffers);
    if (newExpanded.has(offerId)) {
      newExpanded.delete(offerId);
    } else {
      newExpanded.add(offerId);
    }
    setExpandedOffers(newExpanded);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getRecencyColor = (lastRequestAt: string | null) => {
    if (!lastRequestAt) return 'bg-gray-400';

    const now = new Date();
    const lastRequest = new Date(lastRequestAt);
    const diffMs = now.getTime() - lastRequest.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return 'bg-green-500';
    if (diffHours < 24) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getRecencyText = (lastRequestAt: string | null) => {
    if (!lastRequestAt) return 'Never';

    const now = new Date();
    const lastRequest = new Date(lastRequestAt);
    const diffMs = now.getTime() - lastRequest.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const filteredOffersWithStats = offersWithStats.filter(({ offer, stats }) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      offer.offer_name.toLowerCase().includes(searchLower) ||
      ((offer as any).campaign_name || '').toLowerCase().includes(searchLower);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && offer.is_active) ||
      (statusFilter === 'inactive' && !offer.is_active);

    let matchesActivity = true;
    if (activityFilter !== 'all' && stats?.last_request_at) {
      const now = new Date();
      const lastRequest = new Date(stats.last_request_at);
      const diffHours = (now.getTime() - lastRequest.getTime()) / (1000 * 60 * 60);

      if (activityFilter === 'active-1h') {
        matchesActivity = diffHours < 1;
      } else if (activityFilter === 'active-24h') {
        matchesActivity = diffHours < 24;
      } else if (activityFilter === 'idle') {
        matchesActivity = diffHours >= 24;
      }
    } else if (activityFilter === 'idle') {
      matchesActivity = !stats?.last_request_at;
    } else if (activityFilter !== 'all') {
      matchesActivity = false;
    }

    return matchesSearch && matchesStatus && matchesActivity;
  });

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  const activityOptions = [
    { value: 'all', label: 'All Activity' },
    { value: 'active-1h', label: 'Active (Last Hour)' },
    { value: 'active-24h', label: 'Active (Last 24h)' },
    { value: 'idle', label: 'Idle (24h+)' }
  ];

  const totalSuffixRequests = filteredOffersWithStats.reduce(
    (sum, item) => sum + (item.stats?.total_suffix_requests || 0),
    0
  );

  const totalTrackingHits = filteredOffersWithStats.reduce(
    (sum, item) => sum + (item.stats?.total_tracking_hits || 0),
    0
  );

  const totalPages = Math.ceil(filteredOffersWithStats.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOffersWithStats = filteredOffersWithStats.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, activityFilter]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-brand-600 dark:text-brand-400" size={24} />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Analytics Dashboard</h2>
          </div>
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="text-brand-600 dark:text-brand-400" size={24} />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Analytics Dashboard</h2>
          </div>
          <button
            onClick={fetchAllData}
            className="flex items-center gap-2 px-3 py-2 text-sm text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-smooth font-medium"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800/50">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-brand-600 dark:text-brand-400" size={20} />
              <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-100">Total Offers</h3>
            </div>
            <p className="text-3xl font-bold text-brand-700 dark:text-brand-300">{formatNumber(filteredOffersWithStats.length)}</p>
          </div>

          <div className="bg-gradient-to-br from-success-50 to-success-100 dark:from-success-900/20 dark:to-success-800/20 rounded-lg p-4 border border-success-200 dark:border-success-800/50">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="text-success-600 dark:text-success-400" size={20} />
              <h3 className="text-sm font-semibold text-success-900 dark:text-success-100">Total Suffix Requests</h3>
            </div>
            <p className="text-3xl font-bold text-success-700 dark:text-success-300">{formatNumber(totalSuffixRequests)}</p>
          </div>

          <div className="bg-gradient-to-br from-warning-50 to-warning-100 dark:from-warning-900/20 dark:to-warning-800/20 rounded-lg p-4 border border-warning-200 dark:border-warning-800/50">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-warning-600 dark:text-warning-400" size={20} />
              <h3 className="text-sm font-semibold text-warning-900 dark:text-warning-100">Total Tracking Hits</h3>
            </div>
            <p className="text-3xl font-bold text-warning-700 dark:text-warning-300">{formatNumber(totalTrackingHits)}</p>
          </div>
        </div>

        {offersWithStats.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search offers by name..."
                className="flex-1"
              />
              <FilterDropdown
                label="Status"
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <FilterDropdown
                label="Activity"
                options={activityOptions}
                value={activityFilter}
                onChange={setActivityFilter}
              />
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing <span className="font-medium text-neutral-900 dark:text-neutral-50">{filteredOffersWithStats.length}</span> of{' '}
              <span className="font-medium text-neutral-900 dark:text-neutral-50">{offersWithStats.length}</span> offers
            </div>
          </div>
        )}

        {offersWithStats.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50 dark:bg-neutral-925 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-800">
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">No offers yet. Create your first offer to start tracking analytics.</p>
          </div>
        ) : filteredOffersWithStats.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50 dark:bg-neutral-925 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-800">
            <Activity className="mx-auto text-neutral-400 dark:text-neutral-600 mb-4" size={48} />
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
              No offers found
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5">
              No offers match your current filters. Try adjusting your search or filters.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setActivityFilter('all');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth font-medium text-sm"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mb-4">Offers Overview</h3>
            {paginatedOffersWithStats.map(({ offer, stats, recentRequests, urlTraces }) => {
              const isExpanded = expandedOffers.has(offer.id);
              const currentTab = activeTab[offer.id] || 'suffix';
              return (
                <div
                  key={offer.id}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden hover:shadow-sm dark:hover:shadow-none transition-smooth shadow-xs dark:shadow-none"
                >
                  <button
                    onClick={() => toggleOffer(offer.id)}
                    className="w-full bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-smooth"
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-3 h-3 rounded-full ${getRecencyColor(stats?.last_request_at || null)}`} />
                        <div className="text-left flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{offer.offer_name}</h4>
                            {offer.is_active ? (
                              <span className="px-2 py-0.5 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 text-xs font-medium rounded">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                          
                          {/* Campaign Name Badge */}
                          {(offer as any).campaign_name && (
                            <div className="mb-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                                📋 {(offer as any).campaign_name}
                              </span>
                            </div>
                          )}
                          
                          <div className="flex items-center gap-6 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <div className="flex items-center gap-1">
                              <Link2 size={14} />
                              <span className="font-medium text-neutral-900 dark:text-neutral-200">{formatNumber(stats?.total_suffix_requests || 0)}</span>
                              <span className="text-neutral-500 dark:text-neutral-500">suffix requests</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Activity size={14} />
                              <span className="font-medium text-neutral-900 dark:text-neutral-200">{formatNumber(stats?.total_tracking_hits || 0)}</span>
                              <span className="text-neutral-500 dark:text-neutral-500">tracking hits</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={14} />
                              <span className="text-neutral-500 dark:text-neutral-500">Last: {getRecencyText(stats?.last_request_at || null)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-neutral-400 dark:text-neutral-500">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-neutral-50 dark:bg-neutral-925 border-t border-neutral-200 dark:border-neutral-800 p-4 animate-slide-down">
                      <div className="flex gap-2 mb-4 border-b border-neutral-300 dark:border-neutral-700">
                        <button
                          onClick={() => setActiveTab({ ...activeTab, [offer.id]: 'suffix' })}
                          className={`px-4 py-2 text-sm font-medium transition-smooth ${
                            currentTab === 'suffix'
                              ? 'border-b-2 border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400'
                              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                          }`}
                        >
                          Suffix Requests ({recentRequests.length})
                        </button>
                        <button
                          onClick={() => setActiveTab({ ...activeTab, [offer.id]: 'traces' })}
                          className={`px-4 py-2 text-sm font-medium transition-smooth ${
                            currentTab === 'traces'
                              ? 'border-b-2 border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400'
                              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                          }`}
                        >
                          URL Traces ({urlTraces.length})
                        </button>
                      </div>

                      {currentTab === 'suffix' && (
                        <>
                          <h5 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                            Last 10 Suffix Requests
                          </h5>
                          {recentRequests.length === 0 ? (
                            <div className="text-center py-6 text-neutral-500 dark:text-neutral-400 text-sm">
                              No suffix requests yet for this offer
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {recentRequests.map((request) => (
                                <div key={request.id} className="bg-white dark:bg-neutral-850 rounded-lg p-3 border border-neutral-200 dark:border-neutral-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                      <Calendar size={12} />
                                      {formatDate(request.requested_at)}
                                    </div>
                                    <div className="flex items-center gap-1 text-xs">
                                      <Globe size={12} className={request.proxy_ip ? 'text-brand-500 dark:text-brand-400' : 'text-neutral-400 dark:text-neutral-500'} />
                                      <span className={request.proxy_ip ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-neutral-500 dark:text-neutral-400'}>
                                        {request.proxy_ip || request.ip_address || 'N/A'}
                                      </span>
                                    </div>
                                  </div>

                                  {request.params && Object.keys(request.params).length > 0 ? (
                                    <div>
                                      <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1 block">Parameters:</span>
                                      <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-2 space-y-1 border border-neutral-200 dark:border-neutral-800">
                                        {Object.entries(request.params).map(([key, value]) => (
                                          <div key={key} className="flex gap-2 text-xs">
                                            <span className="font-semibold text-neutral-700 dark:text-neutral-300 font-mono">{key}:</span>
                                            <span className="text-neutral-900 dark:text-neutral-100 font-mono break-all">{String(value)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1 block">Suffix:</span>
                                      <code className="px-2 py-1 bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 rounded text-xs font-mono border border-neutral-200 dark:border-neutral-800">
                                        {request.suffix_returned || '(empty)'}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {currentTab === 'traces' && (
                        <>
                          <h5 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                            URL Tracking Hits (Last 100)
                          </h5>
                          {urlTraces.length === 0 ? (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
                              No tracking hits recorded yet
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {urlTraces.map((trace) => {
                                const getDeviceIcon = (deviceType: string) => {
                                  switch (deviceType.toLowerCase()) {
                                    case 'mobile': return <Smartphone size={16} />;
                                    case 'tablet': return <Tablet size={16} />;
                                    case 'bot': return <Bot size={16} />;
                                    default: return <Monitor size={16} />;
                                  }
                                };

                                const getDeviceColor = (deviceType: string) => {
                                  switch (deviceType.toLowerCase()) {
                                    case 'mobile': return 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300';
                                    case 'tablet': return 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300';
                                    case 'bot': return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300';
                                    default: return 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300';
                                  }
                                };

                                return (
                                  <div key={trace.id} className="bg-neutral-50 dark:bg-neutral-850 rounded-lg p-4 border border-neutral-200 dark:border-neutral-800">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${getDeviceColor(trace.device_type)}`}>
                                          {getDeviceIcon(trace.device_type)}
                                          {trace.device_type}
                                        </span>
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                          {new Date(trace.visited_at).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                      {trace.proxy_ip && (
                                        <div className="flex items-center gap-2">
                                          <Globe size={14} className="text-brand-500 dark:text-brand-400" />
                                          <span className="text-neutral-600 dark:text-neutral-400 font-semibold">Proxy IP:</span>
                                          <span className="font-mono text-brand-700 dark:text-brand-300">{trace.proxy_ip}</span>
                                        </div>
                                      )}

                                      {trace.user_agent && (
                                        <div className="flex items-start gap-2">
                                          <Monitor size={14} className="text-neutral-400 dark:text-neutral-500 mt-0.5" />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-neutral-600 dark:text-neutral-400 text-xs font-semibold">User Agent:</span>
                                            <p className="font-mono text-xs text-neutral-900 dark:text-neutral-100 break-all mt-1">{trace.user_agent}</p>
                                          </div>
                                        </div>
                                      )}

                                      {(trace.geo_country || trace.geo_city || trace.geo_region) && (
                                        <div className="flex items-center gap-2">
                                          <Globe size={14} className="text-success-500 dark:text-success-400" />
                                          <span className="text-neutral-600 dark:text-neutral-400 font-semibold">Proxy Location:</span>
                                          <span className="text-neutral-900 dark:text-neutral-100">
                                            {[trace.geo_city, trace.geo_region, trace.geo_country]
                                              .filter(Boolean)
                                              .join(', ')}
                                          </span>
                                        </div>
                                      )}

                                      {!trace.proxy_ip && trace.visitor_ip && (
                                        <div className="flex items-center gap-2">
                                          <Globe size={14} className="text-neutral-400 dark:text-neutral-500" />
                                          <span className="text-neutral-600 dark:text-neutral-400">Visitor IP:</span>
                                          <span className="font-mono text-neutral-900 dark:text-neutral-100">{trace.visitor_ip}</span>
                                        </div>
                                      )}

                                      {!trace.geo_country && trace.country && (
                                        <div className="flex items-center gap-2">
                                          <Globe size={14} className="text-neutral-400 dark:text-neutral-500" />
                                          <span className="text-neutral-600 dark:text-neutral-400">Location:</span>
                                          <span className="text-neutral-900 dark:text-neutral-100">
                                            {trace.city ? `${trace.city}, ` : ''}{trace.country}
                                          </span>
                                        </div>
                                      )}

                                      {trace.referrer && (
                                        <div className="flex items-center gap-2">
                                          <Link2 size={14} className="text-neutral-400 dark:text-neutral-500" />
                                          <span className="text-neutral-600 dark:text-neutral-400">Referrer:</span>
                                          <span className="font-mono text-neutral-900 dark:text-neutral-100 truncate">{trace.referrer}</span>
                                        </div>
                                      )}

                                      {trace.query_params && Object.keys(trace.query_params).length > 0 && (
                                        <div>
                                          <span className="text-neutral-600 dark:text-neutral-400 text-xs font-semibold mb-1 block">Query Parameters:</span>
                                          <div className="bg-white dark:bg-neutral-900 rounded p-2 space-y-1 border border-neutral-200 dark:border-neutral-800">
                                            {Object.entries(trace.query_params).map(([key, value]) => (
                                              <div key={key} className="flex gap-2 text-xs font-mono">
                                                <span className="font-semibold text-neutral-700 dark:text-neutral-300">{key}:</span>
                                                <span className="text-neutral-900 dark:text-neutral-100 break-all">{String(value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {filteredOffersWithStats.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={setItemsPerPage}
              totalItems={filteredOffersWithStats.length}
            />
          )}
        )}
      </div>
    </div>
  );
}
