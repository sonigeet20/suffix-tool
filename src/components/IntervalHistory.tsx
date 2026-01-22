import { useState, useEffect } from 'react';
import { TrendingDown, TrendingUp, Calendar, Edit2, Trash2, Save, X, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface IntervalData {
  offer_id: string;
  offer_name?: string;
  account_id: string;
  date: string;
  interval_used_ms: number;
  total_clicks?: number;
  unique_landing_pages?: number;
  average_repeats: number;
  created_at: string;
  min_interval_override_ms?: number | null;
  max_interval_override_ms?: number | null;
  target_repeat_ratio?: number | null;
  min_repeat_ratio?: number | null;
  script_min_interval_ms?: number | null;
  script_max_interval_ms?: number | null;
  script_target_repeat_ratio?: number | null;
  script_min_repeat_ratio?: number | null;
}

interface EditingRow {
  offer_id: string;
  date: string;
  interval_used_ms: number;
  total_clicks: number;
  unique_landing_pages: number;
  min_interval_override_ms: number | null;
  max_interval_override_ms: number | null;
  target_repeat_ratio: number | null;
  min_repeat_ratio: number | null;
}

const ITEMS_PER_PAGE = 50;

export default function IntervalHistory() {
  const [data, setData] = useState<IntervalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ offer_id: string; date: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchIntervalHistory();
    cleanOldData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedOffer]);

  const fetchIntervalHistory = async () => {
    setLoading(true);
    try {
      const { data: intervals, error } = await supabase
        .from('daily_trace_counts')
        .select('*, offers(offer_name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedData = (intervals || []).map(item => ({
        ...item,
        offer_name: item.offers?.offer_name || item.offer_id,
        total_clicks: item.total_clicks || 0,
        unique_landing_pages: item.unique_landing_pages || 0,
        average_repeats: (item.unique_landing_pages && item.total_clicks) 
          ? item.total_clicks / item.unique_landing_pages 
          : 0
      }));

      setData(processedData);
    } catch (error: any) {
      console.error('Error fetching interval history:', error);
      alert('Failed to fetch interval history: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const cleanOldData = async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

      await supabase
        .from('daily_trace_counts')
        .delete()
        .lt('date', cutoffDate);
    } catch (error: any) {
      console.error('Error cleaning old data:', error);
    }
  };

  const handleEdit = (item: IntervalData) => {
    setEditingRow({
      offer_id: item.offer_id,
      date: item.date,
      interval_used_ms: item.interval_used_ms,
      total_clicks: item.total_clicks || 0,
      unique_landing_pages: item.unique_landing_pages || 0,
      min_interval_override_ms: item.min_interval_override_ms || null,
      max_interval_override_ms: item.max_interval_override_ms || null,
      target_repeat_ratio: item.target_repeat_ratio || null,
      min_repeat_ratio: item.min_repeat_ratio || null
    });
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
  };

  const handleSaveEdit = async () => {
    if (!editingRow) return;

    try {
      const { error } = await supabase
        .from('daily_trace_counts')
        .update({
          interval_used_ms: editingRow.interval_used_ms,
          total_clicks: editingRow.total_clicks,
          unique_landing_pages: editingRow.unique_landing_pages,
          min_interval_override_ms: editingRow.min_interval_override_ms,
          max_interval_override_ms: editingRow.max_interval_override_ms,
          target_repeat_ratio: editingRow.target_repeat_ratio,
          min_repeat_ratio: editingRow.min_repeat_ratio
        })
        .eq('offer_id', editingRow.offer_id)
        .eq('date', editingRow.date);

      if (error) throw error;

      setEditingRow(null);
      fetchIntervalHistory();
      alert('✅ Successfully updated interval data');
    } catch (error: any) {
      console.error('Error updating interval:', error);
      alert('Failed to update: ' + error.message);
    }
  };

  const handleDelete = async (offer_id: string, date: string) => {
    if (deleteConfirm?.offer_id === offer_id && deleteConfirm?.date === date) {
      try {
        const { error } = await supabase
          .from('daily_trace_counts')
          .delete()
          .eq('offer_id', offer_id)
          .eq('date', date);

        if (error) throw error;

        setDeleteConfirm(null);
        fetchIntervalHistory();
        alert('✅ Successfully deleted interval record');
      } catch (error: any) {
        console.error('Error deleting interval:', error);
        alert('Failed to delete: ' + error.message);
      }
    } else {
      setDeleteConfirm({ offer_id, date });
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const uniqueOffers = ['all', ...new Set(data.map(d => d.offer_name || d.offer_id))];

  // Apply offer filter
  let filteredData = selectedOffer === 'all' 
    ? data 
    : data.filter(d => (d.offer_name || d.offer_id) === selectedOffer);
  
  // Apply search filter with safe null checks
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredData = filteredData.filter(d => {
      try {
        const offerName = (d.offer_name || d.offer_id || '').toLowerCase();
        const accountId = (d.account_id || '').toLowerCase();
        const date = (d.date || '').toLowerCase();
        
        return offerName.includes(search) ||
               accountId.includes(search) ||
               date.includes(search);
      } catch (e) {
        return false;
      }
    });
  }

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatInterval = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const isEditing = (offer_id: string, date: string) => {
    return editingRow?.offer_id === offer_id && editingRow?.date === date;
  };

  const isDeletePending = (offer_id: string, date: string) => {
    return deleteConfirm?.offer_id === offer_id && deleteConfirm?.date === date;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Interval History</h2>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              Daily delay speeds calculated per offer based on landing page frequency
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchIntervalHistory}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-smooth disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by offer, account ID, date, or interval..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
            />
          </div>
          <select
            value={selectedOffer}
            onChange={(e) => setSelectedOffer(e.target.value)}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
          >
            {uniqueOffers.map(offer => (
              <option key={offer} value={offer}>
                {offer === 'all' ? 'All Offers' : offer}
              </option>
            ))}
          </select>
          {(searchTerm || selectedOffer !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedOffer('all');
              }}
              className="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 transition-smooth"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Interval History Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Offer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Account ID
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Interval
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Clicks
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Landing Pages
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Avg Repeats
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wider" title="Min interval (click to edit override)">
                  Min Interval
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wider" title="Max interval (click to edit override)">
                  Max Interval
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wider" title="Target ratio (click to edit override)">
                  Target Ratio
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wider" title="Min ratio (click to edit override)">
                  Min Ratio
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-8 text-center text-neutral-500 dark:text-neutral-400">
                    {filteredData.length === 0 ? 'No interval history available' : 'No results found'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                  const prevItem = filteredData[globalIdx + 1];
                  const trend = prevItem 
                    ? item.interval_used_ms - prevItem.interval_used_ms 
                    : 0;
                  
                  const editing = isEditing(item.offer_id, item.date);
                  const deleting = isDeletePending(item.offer_id, item.date);

                  return (
                    <tr key={`${item.offer_id}-${item.date}-${item.created_at}`} className={`hover:bg-neutral-50 dark:hover:bg-neutral-850 ${deleting ? 'bg-error-50 dark:bg-error-900/20' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-neutral-400" />
                          {formatDate(item.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {item.offer_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400 font-mono">
                        {item.account_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <input
                            type="number"
                            value={editingRow?.interval_used_ms || 0}
                            onChange={(e) => editingRow && setEditingRow({ ...editingRow, interval_used_ms: parseInt(e.target.value) || 0 })}
                            className="w-24 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <span className="font-semibold text-brand-600 dark:text-brand-400">
                            {formatInterval(item.interval_used_ms)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50 text-right">
                        {editing ? (
                          <input
                            type="number"
                            value={editingRow?.total_clicks || 0}
                            onChange={(e) => editingRow && setEditingRow({ ...editingRow, total_clicks: parseInt(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          item.total_clicks
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50 text-right">
                        {editing ? (
                          <input
                            type="number"
                            value={editingRow?.unique_landing_pages || 0}
                            onChange={(e) => editingRow && setEditingRow({ ...editingRow, unique_landing_pages: parseInt(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          item.unique_landing_pages
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50 text-right">
                        {editing ? (
                          <span className="text-neutral-600 dark:text-neutral-400">
                            {editingRow && editingRow.unique_landing_pages > 0 
                              ? (editingRow.total_clicks / editingRow.unique_landing_pages).toFixed(2)
                              : '0.00'}x
                          </span>
                        ) : (
                          `${item.average_repeats.toFixed(2)}x`
                        )}
                      </td>
                      {/* Min Interval (Effective Value) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <input
                            type="number"
                            value={editingRow?.min_interval_override_ms ?? ''}
                            onChange={(e) => editingRow && setEditingRow({ 
                              ...editingRow, 
                              min_interval_override_ms: e.target.value ? parseInt(e.target.value) : null 
                            })}
                            placeholder={item.script_min_interval_ms?.toString() || '—'}
                            className="w-24 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <span className={item.min_interval_override_ms ? "font-semibold text-brand-600 dark:text-brand-400" : "text-neutral-900 dark:text-neutral-50"} title={item.min_interval_override_ms ? 'Override active' : (item.script_min_interval_ms ? 'Script default' : 'Not set')}>
                            {item.min_interval_override_ms ? formatInterval(item.min_interval_override_ms) + ' ⚡' : (item.script_min_interval_ms ? formatInterval(item.script_min_interval_ms) : '—')}
                          </span>
                        )}
                      </td>
                      {/* Max Interval (Effective Value) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <input
                            type="number"
                            value={editingRow?.max_interval_override_ms ?? ''}
                            onChange={(e) => editingRow && setEditingRow({ 
                              ...editingRow, 
                              max_interval_override_ms: e.target.value ? parseInt(e.target.value) : null 
                            })}
                            placeholder={item.script_max_interval_ms?.toString() || '—'}
                            className="w-24 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <span className={item.max_interval_override_ms ? "font-semibold text-brand-600 dark:text-brand-400" : "text-neutral-900 dark:text-neutral-50"} title={item.max_interval_override_ms ? 'Override active' : (item.script_max_interval_ms ? 'Script default' : 'Not set')}>
                            {item.max_interval_override_ms ? formatInterval(item.max_interval_override_ms) + ' ⚡' : (item.script_max_interval_ms ? formatInterval(item.script_max_interval_ms) : '—')}
                          </span>
                        )}
                      </td>
                      {/* Target Repeat Ratio (Effective Value) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.1"
                            value={editingRow?.target_repeat_ratio ?? ''}
                            onChange={(e) => editingRow && setEditingRow({ 
                              ...editingRow, 
                              target_repeat_ratio: e.target.value ? parseFloat(e.target.value) : null 
                            })}
                            placeholder={item.script_target_repeat_ratio?.toString() || '—'}
                            className="w-20 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <span className={item.target_repeat_ratio ? "font-semibold text-brand-600 dark:text-brand-400" : "text-neutral-900 dark:text-neutral-50"} title={item.target_repeat_ratio ? 'Override active' : (item.script_target_repeat_ratio ? 'Script default' : 'Not set')}>
                            {item.target_repeat_ratio ? `${item.target_repeat_ratio.toFixed(1)}x ⚡` : (item.script_target_repeat_ratio ? `${item.script_target_repeat_ratio.toFixed(1)}x` : '—')}
                          </span>
                        )}
                      </td>
                      {/* Min Repeat Ratio (Effective Value) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.1"
                            value={editingRow?.min_repeat_ratio ?? ''}
                            onChange={(e) => editingRow && setEditingRow({ 
                              ...editingRow, 
                              min_repeat_ratio: e.target.value ? parseFloat(e.target.value) : null 
                            })}
                            placeholder={item.script_min_repeat_ratio?.toString() || '—'}
                            className="w-20 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <span className={item.min_repeat_ratio ? "font-semibold text-brand-600 dark:text-brand-400" : "text-neutral-900 dark:text-neutral-50"} title={item.min_repeat_ratio ? 'Override active' : (item.script_min_repeat_ratio ? 'Script default' : 'Not set')}>
                            {item.min_repeat_ratio ? `${item.min_repeat_ratio.toFixed(1)}x ⚡` : (item.script_min_repeat_ratio ? `${item.script_min_repeat_ratio.toFixed(1)}x` : '—')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {trend === 0 ? (
                          <span className="text-neutral-400">—</span>
                        ) : trend > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-warning-600 dark:text-warning-400">
                            <TrendingUp size={14} />
                            +{formatInterval(Math.abs(trend))}
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1 text-success-600 dark:text-success-400">
                            <TrendingDown size={14} />
                            -{formatInterval(Math.abs(trend))}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {editing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="p-1.5 text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/20 rounded transition-smooth"
                              title="Save changes"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-smooth"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-smooth"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.offer_id, item.date)}
                              className={`p-1.5 rounded transition-smooth ${
                                deleting
                                  ? 'bg-error-600 text-white hover:bg-error-700'
                                  : 'text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20'
                              }`}
                              title={deleting ? 'Click again to confirm' : 'Delete'}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-smooth disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-smooth disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
        <h4 className="font-semibold text-brand-900 dark:text-brand-300 mb-2">💡 How Intervals Work</h4>
        <div className="text-sm text-brand-800 dark:text-brand-400 space-y-2">
          <p>The system calculates optimal delay intervals based on landing page frequency:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>Three-Scenario Calculation:</strong>
              <ul className="list-circle ml-5 mt-1">
                <li>Scenario 1: ratio ≥ TARGET → SPEEDUP (faster interval)</li>
                <li>Scenario 2: MIN ≤ ratio &lt; TARGET → STABLE (keep yesterday)</li>
                <li>Scenario 3: ratio &lt; MIN → SLOWDOWN (slower interval)</li>
              </ul>
            </li>
            <li><strong>Formula:</strong> averageRepeats = clicks / unique_landing_pages</li>
            <li><strong>Default Values:</strong> TARGET=5x, MIN=1.0x, MIN_INTERVAL=1000ms, MAX_INTERVAL=30000ms</li>
            <li><strong>Effective Values:</strong> Shows script default OR override (⚡ = override active)</li>
            <li><strong>Edit to Override:</strong> Click Edit, enter new value to override script defaults</li>
            <li><strong>Clear Override:</strong> Empty the field to revert to script default</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
