import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Clock, ExternalLink } from 'lucide-react';

interface GclidTrace {
  id: string;
  gclid: string;
  tracking_url: string;
  tracking_trace_status: string | null;
  tracking_trace_hops: number;
  tracking_trace_proxy_ip: string | null;
  tracking_trace_final_url: string | null;
  trace_selected_geo: string | null;
  final_url_params: string | null;
  created_at: string;
}

interface GclidTraceMonitorProps {
  offerName: string;
}

const countryFlags: { [key: string]: string } = {
  US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸',
  NL: '🇳🇱', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮', PL: '🇵🇱', BR: '🇧🇷', MX: '🇲🇽',
  AR: '🇦🇷', CL: '🇨🇱', JP: '🇯🇵', KR: '🇰🇷', CN: '🇨🇳', IN: '🇮🇳', SG: '🇸🇬', MY: '🇲🇾',
  TH: '🇹🇭', ID: '🇮🇩', PH: '🇵🇭', VN: '🇻🇳', NZ: '🇳🇿', ZA: '🇿🇦', AE: '🇦🇪', SA: '🇸🇦'
};

export default function GclidTraceMonitor({ offerName }: GclidTraceMonitorProps) {
  const [traces, setTraces] = useState<GclidTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const autoRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadTraces();
    
    // Auto-refresh every 10 seconds
    autoRefreshInterval.current = setInterval(() => {
      loadTraces();
    }, 10000);

    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, [offerName]);

  const loadTraces = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('gclid_click_mapping')
        .select('id, gclid, tracking_url, tracking_trace_status, tracking_trace_hops, tracking_trace_proxy_ip, tracking_trace_final_url, trace_selected_geo, final_url_params, created_at')
        .eq('offer_name', offerName)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setTraces(data || []);
    } catch (err: any) {
      console.error('Error loading GCLID traces:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string | null) => {
    if (!status || status === 'pending') {
      return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400';
    }
    if (status === 'completed') {
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    }
    if (status === 'failed' || status === 'error') {
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    }
    return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400';
  };

  const truncateText = (text: string | null, maxLength: number) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getCountryFlag = (countryCode: string | null) => {
    if (!countryCode) return '';
    return countryFlags[countryCode.toUpperCase()] || '';
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (loading && traces.length === 0) {
    return (
      <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">Loading GCLID traces...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
        <p className="text-sm">Error loading traces: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            🔍 GCLID Trace Monitor
          </h3>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            (Auto-refresh every 10s)
          </span>
        </div>
        <button
          onClick={loadTraces}
          disabled={loading}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Traces table */}
      {traces.length === 0 ? (
        <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
          <Clock className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
          <p className="text-neutral-600 dark:text-neutral-400">No GCLID traces recorded yet</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            Traces will appear here when tracking URLs are accessed with GCLID parameters
          </p>
        </div>
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    GCLID
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Tracking URL
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Status
                  </th>
                  <th className="px-3 py-2 text-center text-neutral-700 dark:text-neutral-300 font-medium">
                    Hops
                  </th>
                  <th className="px-3 py-2 text-center text-neutral-700 dark:text-neutral-300 font-medium">
                    Geo
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Proxy IP
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Final URL
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Final Params
                  </th>
                  <th className="px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 font-medium">
                    Created
                  </th>
                  <th className="px-3 py-2 text-center text-neutral-700 dark:text-neutral-300 font-medium">
                    
                  </th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <>
                    <tr
                      key={trace.id}
                      className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                        {truncateText(trace.gclid, 20)}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 max-w-xs"
                        title={trace.tracking_url || ''}
                      >
                        {truncateText(trace.tracking_url, 50)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(
                            trace.tracking_trace_status
                          )}`}
                        >
                          {trace.tracking_trace_status || 'pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-neutral-600 dark:text-neutral-400">
                        {trace.tracking_trace_hops || 0}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">
                        {trace.trace_selected_geo ? (
                          <span title={trace.trace_selected_geo}>
                            {getCountryFlag(trace.trace_selected_geo)} {trace.trace_selected_geo}
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                        {trace.tracking_trace_proxy_ip || '-'}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 max-w-xs"
                        title={trace.tracking_trace_final_url || ''}
                      >
                        {truncateText(trace.tracking_trace_final_url, 40)}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 max-w-xs font-mono"
                        title={trace.final_url_params || ''}
                      >
                        {truncateText(trace.final_url_params, 30)}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-500 whitespace-nowrap">
                        {formatRelativeTime(trace.created_at)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleExpandRow(trace.id)}
                          className="text-neutral-500 hover:text-brand-600 dark:text-neutral-400 dark:hover:text-brand-400"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedRow === trace.id && (
                      <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-800">
                        <td colSpan={10} className="px-3 py-4">
                          <div className="space-y-3 text-xs">
                            <div>
                              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Full GCLID:</span>
                              <div className="mt-1 p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 font-mono break-all">
                                {trace.gclid}
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Full Tracking URL:</span>
                              <div className="mt-1 p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                                {trace.tracking_url}
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Full Final URL:</span>
                              <div className="mt-1 p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                                {trace.tracking_trace_final_url || 'N/A'}
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Final URL Parameters:</span>
                              <div className="mt-1 p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 font-mono break-all">
                                {trace.final_url_params || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats footer */}
      {traces.length > 0 && (
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 px-2">
          <span>Showing {traces.length} most recent traces (last 50 auto-kept)</span>
          <span>
            Completed: {traces.filter((t) => t.tracking_trace_status === 'completed').length} | 
            Failed: {traces.filter((t) => t.tracking_trace_status === 'failed' || t.tracking_trace_status === 'error').length} | 
            Pending: {traces.filter((t) => !t.tracking_trace_status || t.tracking_trace_status === 'pending').length}
          </span>
        </div>
      )}
    </div>
  );
}
