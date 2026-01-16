import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../lib/supabase';

interface CampaignMapping {
  id: number;
  mapping_id: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  offer_name: string;
  offer_id: string | null;
  trackier_campaign_id: number;
  trackier_webhook_url: string;
  is_active: boolean;
  webhook_configured: boolean;
  first_webhook_received_at: string | null;
  created_at: string;
  created_by: string | null;
  bucket_stats?: {
    total_suffixes: number;
    valid_suffixes: number;
    total_usage: number;
    last_fetch: number | null;
  };
}

const PROXY_SERVICE_URL = import.meta.env.VITE_PROXY_SERVICE_URL || 'http://localhost:3000';

export const WebhookCampaignMapper: React.FC = () => {
  const [mappings, setMappings] = useState<CampaignMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [offers, setOffers] = useState<string[]>([]);
  const [filteredOffers, setFilteredOffers] = useState<string[]>([]);
  const [showOfferDropdown, setShowOfferDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'pending'>('all');
  
  // Selection state
  const [selectedMappings, setSelectedMappings] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    accountId: '',
    campaignId: '',
    campaignName: '',
    offerName: '',
    offerId: ''
  });

  // Load offers and mappings on mount
  useEffect(() => {
    loadOffers();
    loadMappings();
  }, []);

  // Filter offers when search changes
  useEffect(() => {
    if (formData.offerName) {
      const filtered = offers.filter(offer => 
        offer.toLowerCase().includes(formData.offerName.toLowerCase())
      );
      setFilteredOffers(filtered);
    } else {
      setFilteredOffers(offers);
    }
  }, [formData.offerName, offers]);

  const loadOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('offer_name')
        .order('offer_name');
      
      if (error) throw error;
      
      const uniqueOffers = [...new Set(data.map(o => o.offer_name))];
      setOffers(uniqueOffers);
      setFilteredOffers(uniqueOffers);
    } catch (err: any) {
      console.error('Error loading offers:', err);
    }
  };

  const loadMappings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Query Supabase directly instead of HTTP ALB (avoids mixed content error)
      const { data, error: supabaseError } = await supabase
        .from('webhook_campaign_mappings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (supabaseError) throw supabaseError;
      
      setMappings(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load mappings');
      console.error('Error loading mappings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.accountId || !formData.campaignId || !formData.offerName) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(`${PROXY_SERVICE_URL}/api/webhook-campaign/create`, {
        accountId: formData.accountId,
        campaignId: formData.campaignId,
        campaignName: formData.campaignName || `Campaign ${formData.campaignId}`,
        offerName: formData.offerName,
        offerId: formData.offerId || null,
        createdBy: 'user'
      });

      if (response.data.success) {
        alert(`✅ Campaign mapping created!\n\nWebhook URL:\n${response.data.trackier.webhookUrl}\n\nAdd this URL to Trackier S2S postback for Campaign ID ${response.data.trackier.campaignId}`);
        
        // Reset form
        setFormData({
          accountId: '',
          campaignId: '',
          campaignName: '',
          offerName: '',
          offerId: ''
        });
        setShowCreateForm(false);
        
        // Reload mappings
        await loadMappings();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
      alert(`❌ Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (mappingId: string) => {
    try {
      const response = await axios.patch(
        `${PROXY_SERVICE_URL}/api/webhook-campaign/${mappingId}/toggle`
      );

      if (response.data.success) {
        // Update local state
        setMappings(prev => prev.map(m => 
          m.mapping_id === mappingId 
            ? { ...m, is_active: response.data.is_active }
            : m
        ));
      }
    } catch (err: any) {
      alert(`Error toggling status: ${err.response?.data?.error || err.message}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('📋 Copied to clipboard!');
  };

  // Selection handlers
  const toggleSelection = (mappingId: string) => {
    setSelectedMappings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mappingId)) {
        newSet.delete(mappingId);
      } else {
        newSet.add(mappingId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedMappings(new Set(filteredMappings.map(m => m.mapping_id)));
  };

  const deselectAll = () => {
    setSelectedMappings(new Set());
  };

  // Bulk download CSV
  const downloadCSV = () => {
    const selected = mappings.filter(m => selectedMappings.has(m.mapping_id));
    
    const csvHeader = 'Campaign Name,Offer Name,Account ID,Campaign ID,Trackier Campaign ID,Webhook URL,Tracking Template,Status,Created At\n';
    const csvRows = selected.map(m => {
      // Generate tracking template URL
      const trackingTemplate = `https://nebula.gotrackier.com/click?campaign_id=${m.trackier_campaign_id}&pub_id=8308&force_transparent=true&url={lpurl}`;
      
      const row = [
        m.campaign_name || '',
        m.offer_name,
        m.account_id,
        m.campaign_id,
        m.trackier_campaign_id,
        m.trackier_webhook_url,
        trackingTemplate,
        m.is_active ? 'Active' : 'Inactive',
        new Date(m.created_at).toISOString()
      ];
      return row.map(field => `"${field}"`).join(',');
    }).join('\n');
    
    const csv = csvHeader + csvRows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhook-mappings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk delete
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedMappings.size} mapping(s)? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const deletePromises = Array.from(selectedMappings).map(mappingId =>
        supabase
          .from('webhook_campaign_mappings')
          .delete()
          .eq('mapping_id', mappingId)
      );

      await Promise.all(deletePromises);
      
      await loadMappings();
      setSelectedMappings(new Set());
      setSelectionMode(false);
    } catch (err: any) {
      alert(`Error deleting mappings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter mappings by configuration status
  const filteredMappings = mappings.filter(mapping => {
    if (statusFilter === 'configured') return mapping.webhook_configured;
    if (statusFilter === 'pending') return !mapping.webhook_configured;
    return true; // 'all'
  });

  const pendingCount = mappings.filter(m => !m.webhook_configured).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Webhook Campaign Mapper
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Manage webhook-triggered suffix updates for Google Ads campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth disabled:opacity-50"
            disabled={loading}
          >
            {showCreateForm ? 'Cancel' : '+ New Mapping'}
          </button>
          {mappings.length > 0 && (
            <button
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelectedMappings(new Set());
              }}
              className={`px-4 py-2 rounded-lg transition-smooth ${
                selectionMode 
                  ? 'bg-neutral-600 text-white hover:bg-neutral-700' 
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-300 dark:hover:bg-neutral-600'
              }`}
            >
              {selectionMode ? 'Cancel Selection' : 'Select'}
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectionMode && selectedMappings.size > 0 && (
        <div className="p-4 bg-brand-50 dark:bg-brand-900/20 border-2 border-brand-300 dark:border-brand-700 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {selectedMappings.size} selected
            </span>
            <button
              onClick={selectAll}
              className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              Select All ({filteredMappings.length})
            </button>
            <button
              onClick={deselectAll}
              className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
            >
              Deselect All
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-smooth flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download CSV
            </button>
            <button
              onClick={bulkDelete}
              className="px-4 py-2 bg-error-600 text-white rounded-lg hover:bg-error-700 transition-smooth flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected
            </button>
          </div>
        </div>
      )}
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-smooth font-medium text-sm"
          >
            {showCreateForm ? 'Cancel' : '+ New Mapping'}
          </button>
        </div>
      </div>

      {/* Status Filter */}
      {mappings.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Filter:</label>
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-smooth ${ statusFilter === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              All ({mappings.length})
            </button>
            <button
              onClick={() => setStatusFilter('configured')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-smooth ${
                statusFilter === 'configured'
                  ? 'bg-success-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              ✓ Configured ({mappings.length - pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-smooth ${
                statusFilter === 'pending'
                  ? 'bg-warning-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              ⚠️ Pending ({pendingCount})
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateMapping} className="p-6 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-50">Create New Campaign Mapping</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Google Ads Account ID *
              </label>
              <input
                type="text"
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                placeholder="123-456-7890"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Google Ads Campaign ID *
              </label>
              <input
                type="text"
                value={formData.campaignId}
                onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                placeholder="12345678"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={formData.campaignName}
                onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                placeholder="My Campaign"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Offer Name *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.offerName}
                  onChange={(e) => {
                    setFormData({ ...formData, offerName: e.target.value });
                    setShowOfferDropdown(true);
                  }}
                  onFocus={() => setShowOfferDropdown(true)}
                  placeholder="Search or type offer name..."
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
                  required
                />
                {showOfferDropdown && filteredOffers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredOffers.slice(0, 20).map((offer) => (
                      <div
                        key={offer}
                        onClick={() => {
                          setFormData({ ...formData, offerName: offer });
                          setShowOfferDropdown(false);
                        }}
                        className="px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-900/20 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300"
                      >
                        {offer}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Offer ID (Optional)
              </label>
              <input
                type="text"
                value={formData.offerId}
                onChange={(e) => setFormData({ ...formData, offerId: e.target.value })}
                placeholder="offer_123"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-smooth disabled:opacity-50 font-medium"
            >
              {loading ? 'Creating...' : 'Create Mapping'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setShowOfferDropdown(false);
              }}
              className="px-6 py-2 bg-neutral-400 dark:bg-neutral-600 text-white rounded-lg hover:bg-neutral-500 dark:hover:bg-neutral-700 transition-smooth font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Mappings List */}
      <div className="space-y-4">
        {loading && mappings.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">Loading mappings...</div>
        ) : filteredMappings.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 p-6 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
            {statusFilter === 'all' 
              ? 'No campaign mappings yet. Create one to get started!'
              : `No ${statusFilter} mappings found.`}
          </div>
        ) : (
          filteredMappings.map((mapping) => (
            <div
              key={mapping.mapping_id}
              className={`p-5 rounded-lg border-2 ${
                selectionMode && selectedMappings.has(mapping.mapping_id)
                  ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/30'
                  : mapping.is_active 
                    ? 'border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20' 
                    : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-850'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedMappings.has(mapping.mapping_id)}
                      onChange={() => toggleSelection(mapping.mapping_id)}
                      className="w-5 h-5 mt-1 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 focus:ring-brand-500 focus:ring-2"
                    />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                      {mapping.offer_name}
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {mapping.campaign_name || `Campaign ${mapping.campaign_id}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    mapping.is_active 
                      ? 'bg-success-600 dark:bg-success-500 text-white' 
                      : 'bg-neutral-400 dark:bg-neutral-600 text-white'
                  }`}>
                    {mapping.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {!mapping.webhook_configured && (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-warning-600 dark:bg-warning-500 text-white animate-pulse">
                      ⚠️ Webhook Pending
                    </span>
                  )}
                  {mapping.webhook_configured && mapping.first_webhook_received_at && (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-brand-600 dark:bg-brand-500 text-white" title={`First webhook: ${new Date(mapping.first_webhook_received_at).toLocaleString()}`}>
                      ✓ Configured
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleActive(mapping.mapping_id)}
                    className="px-3 py-1 bg-brand-500 text-white text-sm rounded hover:bg-brand-600 transition-smooth"
                  >
                    Toggle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">Account ID:</span>
                  <span className="ml-2 text-neutral-600 dark:text-neutral-400">{mapping.account_id}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">Campaign ID:</span>
                  <span className="ml-2 text-neutral-600 dark:text-neutral-400">{mapping.campaign_id}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">Trackier Campaign:</span>
                  <span className="ml-2 text-neutral-600 dark:text-neutral-400">{mapping.trackier_campaign_id}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">Created:</span>
                  <span className="ml-2 text-neutral-600 dark:text-neutral-400">
                    {new Date(mapping.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Bucket Stats */}
              {mapping.bucket_stats && (
                <div className="mb-3 p-3 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-xs">Total Suffixes</div>
                      <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                        {mapping.bucket_stats.total_suffixes}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-xs">Valid Suffixes</div>
                      <div className="text-lg font-semibold text-success-600 dark:text-success-400">
                        {mapping.bucket_stats.valid_suffixes}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-xs">Total Usage</div>
                      <div className="text-lg font-semibold text-brand-600 dark:text-brand-400">
                        {mapping.bucket_stats.total_usage}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-xs">Last Fetch</div>
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        {mapping.bucket_stats.last_fetch 
                          ? new Date(mapping.bucket_stats.last_fetch).toLocaleDateString()
                          : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Webhook URL */}
              <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded border border-neutral-300 dark:border-neutral-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Trackier S2S Webhook URL:
                    {!mapping.webhook_configured && (
                      <span className="ml-2 text-warning-600 dark:text-warning-400 font-semibold">
                        ⚠️ Add this to Trackier!
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => copyToClipboard(mapping.trackier_webhook_url)}
                    className="text-xs px-2 py-1 bg-neutral-600 dark:bg-neutral-500 text-white rounded hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth"
                  >
                    Copy
                  </button>
                </div>
                <code className="text-xs text-neutral-800 dark:text-neutral-200 break-all font-mono">
                  {mapping.trackier_webhook_url}
                </code>
                {!mapping.webhook_configured && (
                  <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded text-xs text-warning-800 dark:text-warning-300">
                    <strong>Setup Instructions:</strong><br/>
                    1. Copy webhook URL above<br/>
                    2. Log in to Trackier dashboard<br/>
                    3. Go to Campaign #{mapping.trackier_campaign_id}<br/>
                    4. Add S2S Postback with this URL<br/>
                    5. System will auto-detect first webhook
                  </div>
                )}
                {mapping.webhook_configured && mapping.first_webhook_received_at && (
                  <div className="mt-2 p-2 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded text-xs text-success-800 dark:text-success-300">
                    ✅ Webhook configured and working! First webhook received: {new Date(mapping.first_webhook_received_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Tracking Template */}
              <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded border border-neutral-300 dark:border-neutral-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Google Ads Tracking Template:
                  </span>
                  <button
                    onClick={() => copyToClipboard(`https://nebula.gotrackier.com/click?campaign_id=${mapping.trackier_campaign_id}&pub_id=8308&force_transparent=true&url={lpurl}`)}
                    className="text-xs px-2 py-1 bg-neutral-600 dark:bg-neutral-500 text-white rounded hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth"
                  >
                    Copy
                  </button>
                </div>
                <code className="text-xs text-neutral-800 dark:text-neutral-200 break-all font-mono">
                  https://nebula.gotrackier.com/click?campaign_id={mapping.trackier_campaign_id}&pub_id=8308&force_transparent=true&url={'{lpurl}'}
                </code>
                <div className="mt-2 p-2 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded text-xs text-brand-800 dark:text-brand-300">
                  <strong>📋 Add to Google Ads:</strong><br/>
                  1. Copy tracking template above<br/>
                  2. Go to Google Ads campaign settings<br/>
                  3. Paste in "Tracking template" field at campaign level<br/>
                  4. Save changes
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Refresh Button */}
      <div className="text-center">
        <button
          onClick={loadMappings}
          disabled={loading}
          className="px-6 py-2 bg-neutral-600 dark:bg-neutral-500 text-white rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth disabled:opacity-50 font-medium"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Mappings'}
        </button>
      </div>
    </div>
  );
};
