import { useState, useEffect } from 'react';
import { Clock, TrendingDown, TrendingUp, Calendar, Edit2, Trash2, Save, X, RefreshCw, Search } from 'lucide-react';
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
}

interface EditingRow {
  offer_id: string;
  date: string;
  interval_used_ms: number;
  total_clicks: number;
  unique_landing_pages: number;
}

export default function IntervalHistory() {
  const [data, setData] = useState<IntervalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ offer_id: string; date: string } | null>(null);

  useEffect(() => {
    fetchIntervalHistory();
  }, []);

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

  const handleEdit = (item: IntervalData) => {
    setEditingRow({
      offer_id: item.offer_id,
      date: item.date,
      interval_used_ms: item.interval_used_ms,
      total_clicks: item.total_clicks || 0,
      unique_landing_pages: item.unique_landing_pages || 0
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
          unique_landing_pages: editingRow.unique_landing_pages
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
  
  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredData = filteredData.filter(d => 
      (d.offer_name || d.offer_id).toLowerCase().includes(search) ||
      d.account_id.toLowerCase().includes(search) ||
      d.date.includes(search) ||
      formatInterval(d.interval_used_ms).toLowerCase().includes(search)
    );
  }

  // Group by offer and get latest interval
  const latestByOffer = data.reduce((acc, item) => {
    const key = item.offer_name || item.offer_id;
    if (!acc[key] || new Date(item.date) > new Date(acc[key].date)) {
      acc[key] = item;
    }
    return acc;
  }, {} as Record<string, IntervalData>);

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(latestByOffer).map(([offerName, latest]) => (
          <div key={offerName} className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-50 text-sm truncate flex-1">
                {offerName}
              </h3>
              <Clock className="text-brand-600 dark:text-brand-400 flex-shrink-0" size={18} />
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                  {formatInterval(latest.interval_used_ms)}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">Current Delay</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-neutral-600 dark:text-neutral-400">Avg Repeats</p>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {latest.average_repeats.toFixed(1)}x
                  </p>
                </div>
                <div>
                  <p className="text-neutral-600 dark:text-neutral-400">Last Updated</p>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {formatDate(latest.trace_date)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed History Table */}
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
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-neutral-500 dark:text-neutral-400">
                    No interval history available
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const prevItem = filteredData[idx + 1];
                  const trend = prevItem 
                    ? item.interval_used_ms - prevItem.interval_used_ms 
                    : 0;
                  
                  const editing = isEditing(item.offer_name, item.trace_date);
                  const deleting = isDeletePending(item.offer_name, item.trace_date);

                  return (
                    <tr key={`${item.offer_name}-${item.trace_date}-${item.created_at}`} className={`hover:bg-neutral-50 dark:hover:bg-neutral-850 ${deleting ? 'bg-error-50 dark:bg-error-900/20' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-neutral-400" />
                          {formatDate(item.trace_date)}
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
                            value={editingRow.interval_used_ms}
                            onChange={(e) => setEditingRow({ ...editingRow, interval_used_ms: parseInt(e.target.value) || 0 })}
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
                            value={editingRow.total_clicks}
                            onChange={(e) => setEditingRow({ ...editingRow, total_clicks: parseInt(e.target.value) || 0 })}
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
                            value={editingRow.unique_landing_pages}
                            onChange={(e) => setEditingRow({ ...editingRow, unique_landing_pages: parseInt(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 text-right border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          item.unique_landing_pages
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-neutral-50 text-right">
                        {editing ? (
                          <span className="text-neutral-600 dark:text-neutral-400">
                            {editingRow.unique_landing_pages > 0 
                              ? (editingRow.total_clicks / editingRow.unique_landing_pages).toFixed(2)
                              : '0.00'}x
                          </span>
                        ) : (
                          `${item.average_repeats.toFixed(2)}x`
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
                              onClick={() => handleDelete(item.offer_name, item.trace_date)}
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
      </div>

      <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
        <h4 className="font-semibold text-brand-900 dark:text-brand-300 mb-2">💡 How Intervals Work</h4>
        <div className="text-sm text-brand-800 dark:text-brand-400 space-y-2">
          <p>The system calculates optimal delay intervals based on landing page frequency:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>Formula:</strong> next_interval = yesterday_interval × (5 / average_repeats)</li>
            <li><strong>Target:</strong> 5 clicks per landing page on average</li>
            <li><strong>Constraints:</strong> Between 1000ms (min) and 30000ms (max)</li>
            <li><strong>Updates:</strong> Calculated once per day based on previous day's data</li>
            <li><strong>Caching:</strong> Same interval used throughout the day (recalculates next day)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
