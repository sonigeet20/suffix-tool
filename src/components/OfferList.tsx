import { useEffect, useState } from 'react';
import { supabase, Offer } from '../lib/supabase';
import { Plus, Edit, Trash2, Link2, ExternalLink, Copy, CheckCircle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import OfferForm from './OfferForm';
import SearchBar from './ui/SearchBar';
import FilterDropdown from './ui/FilterDropdown';
import Pagination from './ui/Pagination';

export default function OfferList() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | undefined>();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOffers(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this offer?')) return;

    const { error } = await supabase.from('offers').delete().eq('id', id);
    if (!error) {
      fetchOffers();
    }
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingOffer(undefined);
  };

  const handleSave = () => {
    fetchOffers();
    handleCloseForm();
  };

  const getApiUrl = (offerName: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offerName)}`;
  };

  const copyToClipboard = async (offerId: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(offerId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTraceExpanded = (offerId: string) => {
    const newExpanded = new Set(expandedTraces);
    if (newExpanded.has(offerId)) {
      newExpanded.delete(offerId);
    } else {
      newExpanded.add(offerId);
    }
    setExpandedTraces(newExpanded);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const filteredOffers = offers.filter((offer) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      offer.offer_name.toLowerCase().includes(searchLower) ||
      offer.final_url.toLowerCase().includes(searchLower) ||
      ((offer as any).campaign_name || '').toLowerCase().includes(searchLower);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && offer.is_active) ||
      (statusFilter === 'inactive' && !offer.is_active);

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredOffers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOffers = filteredOffers.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  if (loading) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">Loading offers...</div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Your Offers</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Manage your URL tracking offers</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-smooth font-medium text-sm h-9"
        >
          <Plus size={18} />
          New Offer
        </button>
      </div>

      {offers.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search offers by name or URL..."
            className="flex-1"
          />
          <FilterDropdown
            label="Status"
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
      )}

      {offers.length > 0 && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing <span className="font-medium text-neutral-900 dark:text-neutral-50">{filteredOffers.length}</span> of{' '}
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{offers.length}</span> offers
        </div>
      )}

      {offers.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <Link2 className="mx-auto text-neutral-400 dark:text-neutral-600 mb-4" size={40} />
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mb-1.5">
            No offers yet
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
            Create your first offer to start tracking URLs
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-smooth font-medium text-sm h-9"
          >
            <Plus size={18} />
            Create First Offer
          </button>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <Link2 className="mx-auto text-neutral-400 dark:text-neutral-600 mb-4" size={40} />
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mb-1.5">
            No offers found
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
            No offers match your current filters. Try adjusting your search or filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-smooth font-medium text-sm h-9"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
        <div className="grid gap-4">
          {paginatedOffers.map((offer) => {
            const apiUrl = getApiUrl(offer.offer_name);
            return (
              <div
                key={offer.id}
                className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition-smooth shadow-xs dark:shadow-none"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 truncate">
                        {offer.offer_name}
                      </h3>
                      {offer.is_active ? (
                        <span className="px-2 py-0.5 bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400 text-xs font-medium rounded-md flex-shrink-0">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 text-xs font-medium rounded-md flex-shrink-0">
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
                    
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      <ExternalLink size={12} />
                      <a
                        href={offer.final_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-brand-600 dark:hover:text-brand-400 truncate transition-colors"
                      >
                        {offer.final_url}
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-3">
                    <button
                      onClick={() => handleEdit(offer)}
                      className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-smooth"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(offer.id)}
                      className="p-1.5 text-neutral-500 hover:text-error-600 dark:text-neutral-400 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 rounded-md transition-smooth"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {offer.tracking_template && (
                    <div className="flex items-start gap-2">
                      <span className="text-neutral-500 dark:text-neutral-400 font-medium min-w-[120px] flex-shrink-0">
                        Tracking Template:
                      </span>
                      <span className="text-neutral-700 dark:text-neutral-300 truncate text-xs">
                        {offer.tracking_template}
                      </span>
                    </div>
                  )}

                  {offer.target_geo && (
                    <div className="flex items-start gap-2">
                      <span className="text-neutral-500 dark:text-neutral-400 font-medium min-w-[120px] flex-shrink-0">
                        Target Geo:
                      </span>
                      <span className="text-neutral-700 dark:text-neutral-300 text-xs">{offer.target_geo}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2 pt-2.5 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium min-w-[120px] flex-shrink-0">
                      API Endpoint:
                    </span>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <code className="flex-1 bg-brand-50 dark:bg-brand-500/10 px-2 py-1 rounded text-brand-700 dark:text-brand-400 font-mono text-xs truncate">
                        {apiUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(offer.id, apiUrl)}
                        className="p-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-smooth flex-shrink-0"
                        title="Copy to clipboard"
                      >
                        {copiedId === offer.id ? (
                          <CheckCircle size={14} className="text-success-600 dark:text-success-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {offer.tracking_template && (
                    <div className="mt-2.5 pt-2.5 border-t border-neutral-200 dark:border-neutral-800">
                      <button
                        onClick={() => toggleTraceExpanded(offer.id)}
                        className="w-full flex items-center justify-between p-2 hover:bg-neutral-50 dark:hover:bg-neutral-850 rounded-md transition-smooth"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-600 dark:text-neutral-300 font-medium text-xs">
                            Redirect Chain Trace
                          </span>
                          {offer.last_trace_date && (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">
                              (Last traced: {formatDate(offer.last_trace_date)})
                            </span>
                          )}
                        </div>
                        {expandedTraces.has(offer.id) ? (
                          <ChevronUp size={14} className="text-neutral-400 dark:text-neutral-500" />
                        ) : (
                          <ChevronDown size={14} className="text-neutral-400 dark:text-neutral-500" />
                        )}
                      </button>

                      {expandedTraces.has(offer.id) && (
                        <div className="mt-2 bg-neutral-50 dark:bg-neutral-925 rounded-md p-3 animate-slide-down">
                          {!offer.last_traced_chain || offer.last_traced_chain.length === 0 ? (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                              No trace data yet. Call the get-suffix API to trace the redirect chain.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                                  Redirect Chain Steps:
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                  ({offer.last_traced_chain.length} {offer.last_traced_chain.length === 1 ? 'step' : 'steps'})
                                </span>
                              </div>
                              {offer.last_traced_chain.map((step: any, index: number) => (
                                <div
                                  key={index}
                                  className={`relative pl-5 pb-2 ${
                                    index < offer.last_traced_chain!.length - 1 ? 'border-l-2 border-brand-300 dark:border-brand-500/30' : ''
                                  }`}
                                >
                                  <div className="absolute left-0 top-0 -ml-1 w-2 h-2 rounded-full bg-brand-500 dark:bg-brand-400"></div>
                                  <div className="bg-white dark:bg-neutral-850 rounded-md p-2.5 border border-neutral-200 dark:border-neutral-800">
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                                          Step {index + 1}
                                        </span>
                                        {index === offer.redirect_chain_step && (
                                          <span className="px-1.5 py-0.5 bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400 text-xs font-medium rounded-md">
                                            Params Extracted
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded-md ${
                                          step.status >= 200 && step.status < 300
                                            ? 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400'
                                            : step.status >= 300 && step.status < 400
                                            ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400'
                                            : 'bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400'
                                        }`}>
                                          {step.status}
                                        </span>
                                        <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 text-xs font-medium rounded-md">
                                          {step.redirect_type}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-xs text-neutral-600 dark:text-neutral-400 break-all mb-1">
                                      {step.url}
                                    </div>
                                    {step.params && Object.keys(step.params).length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Parameters:</span>
                                        <div className="mt-1 space-y-0.5">
                                          {Object.entries(step.params).map(([key, value]: [string, any]) => (
                                            <div key={key} className="flex gap-2 text-xs">
                                              <span className="font-medium text-neutral-500 dark:text-neutral-400">{key}:</span>
                                              <span className="text-neutral-700 dark:text-neutral-300">{value}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {index < offer.last_traced_chain!.length - 1 && (
                                    <div className="absolute left-0 bottom-0 -ml-1">
                                      <ArrowRight size={12} className="text-brand-500 dark:text-brand-400 transform rotate-90" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredOffers.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
            totalItems={filteredOffers.length}
          />
        )}
        </>
      )}

      {showForm && (
        <OfferForm
          offer={editingOffer}
          onClose={handleCloseForm}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
