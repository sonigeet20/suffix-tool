import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, TestTube, CheckCircle, XCircle, AlertCircle, Loader } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  provider_type: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

interface TestProviderModalProps {
  provider: Provider;
  onClose: () => void;
}

interface BasicTestResult {
  success: boolean;
  status: string;
  response_time_ms: number;
  ip_address?: string;
  error?: string;
  details?: any;
}

interface GeoTestResult {
  success: boolean;
  success_rate: number;
  successful_requests: number;
  total_requests: number;
  summary: string;
  results: Array<{
    request_number: number;
    requested_country: string;
    actual_country: string;
    ip_address: string;
    response_time_ms: number;
    status: string;
    error?: string;
  }>;
}

export default function TestProviderModal({ provider, onClose }: TestProviderModalProps) {
  const [testing, setTesting] = useState(false);
  const [basicTestComplete, setBasicTestComplete] = useState(false);
  const [basicResult, setBasicResult] = useState<BasicTestResult | null>(null);
  const [geoResult, setGeoResult] = useState<GeoTestResult | null>(null);
  const [targetCountry, setTargetCountry] = useState('US');
  const [numRequests, setNumRequests] = useState(3);

  const popularCountries = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'AU', name: 'Australia' },
    { code: 'JP', name: 'Japan' },
    { code: 'BR', name: 'Brazil' },
  ];

  const runBasicTest = async () => {
    setTesting(true);
    setBasicResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers/test`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: provider.host,
          port: provider.port,
          username: provider.username,
          password: provider.password,
          provider_type: provider.provider_type,
          test_type: 'basic',
        }),
      });

      const data = await response.json();
      setBasicResult(data);
      setBasicTestComplete(data.success);
    } catch (error: any) {
      setBasicResult({
        success: false,
        status: 'failed',
        response_time_ms: 0,
        error: error.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const runGeoTest = async () => {
    if (!basicTestComplete) {
      alert('Please run and pass the basic test first');
      return;
    }

    setTesting(true);
    setGeoResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers/test`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: provider.host,
          port: provider.port,
          username: provider.username,
          password: provider.password,
          provider_type: provider.provider_type,
          test_type: 'geo',
          target_country: targetCountry,
          num_requests: numRequests,
        }),
      });

      const data = await response.json();
      setGeoResult(data);
    } catch (error: any) {
      alert(`Test failed: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'match' || status === 'connected') {
      return <CheckCircle className="text-green-600" size={18} />;
    } else if (status === 'mismatch') {
      return <AlertCircle className="text-yellow-600" size={18} />;
    } else {
      return <XCircle className="text-red-600" size={18} />;
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'match' || status === 'connected') {
      return 'bg-green-50 border-green-200 text-green-700';
    } else if (status === 'mismatch') {
      return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    } else {
      return 'bg-red-50 border-red-200 text-red-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Test Provider Connection</h2>
            <p className="text-sm text-gray-600 mt-1">{provider.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Basic Connectivity Test</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Verify that the proxy is reachable and credentials are valid
                </p>
              </div>
              <button
                onClick={runBasicTest}
                disabled={testing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
              >
                {testing && !basicResult ? (
                  <>
                    <Loader className="animate-spin" size={18} />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube size={18} />
                    Run Basic Test
                  </>
                )}
              </button>
            </div>

            {basicResult && (
              <div className={`p-4 rounded-lg border ${getStatusColor(basicResult.status)}`}>
                <div className="flex items-center gap-2 mb-3">
                  {getStatusIcon(basicResult.status)}
                  <span className="font-semibold">
                    {basicResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="font-medium">{basicResult.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Response Time:</span>
                    <span className="font-medium">{basicResult.response_time_ms}ms</span>
                  </div>
                  {basicResult.ip_address && (
                    <div className="flex justify-between">
                      <span>IP Address:</span>
                      <span className="font-mono font-medium">{basicResult.ip_address}</span>
                    </div>
                  )}
                  {basicResult.error && (
                    <div className="mt-2 pt-2 border-t border-current">
                      <span className="font-medium">Error:</span> {basicResult.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Geo-Targeting Validation Test</h3>
              <p className="text-sm text-gray-600 mt-1">
                Verify that the proxy correctly targets the specified country
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Country
                </label>
                <select
                  value={targetCountry}
                  onChange={(e) => setTargetCountry(e.target.value)}
                  disabled={testing || !basicTestComplete}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                >
                  {popularCountries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Requests
                </label>
                <select
                  value={numRequests}
                  onChange={(e) => setNumRequests(parseInt(e.target.value))}
                  disabled={testing || !basicTestComplete}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                >
                  <option value={1}>1 request</option>
                  <option value={3}>3 requests</option>
                  <option value={5}>5 requests</option>
                </select>
              </div>
            </div>

            <button
              onClick={runGeoTest}
              disabled={testing || !basicTestComplete}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {testing && basicTestComplete ? (
                <>
                  <Loader className="animate-spin" size={18} />
                  Running Test...
                </>
              ) : (
                <>
                  <TestTube size={18} />
                  Run Geo-Targeting Test
                </>
              )}
            </button>

            {!basicTestComplete && (
              <p className="mt-2 text-sm text-gray-500 text-center">
                Complete the basic test first to enable geo-targeting test
              </p>
            )}

            {geoResult && (
              <div className="mt-6 space-y-4">
                <div
                  className={`p-4 rounded-lg border ${
                    geoResult.success_rate === 100
                      ? 'bg-green-50 border-green-200'
                      : geoResult.success_rate >= 80
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {geoResult.success_rate === 100 ? (
                      <CheckCircle className="text-green-600" size={20} />
                    ) : geoResult.success_rate >= 80 ? (
                      <AlertCircle className="text-yellow-600" size={20} />
                    ) : (
                      <XCircle className="text-red-600" size={20} />
                    )}
                    <span className="font-semibold">
                      {geoResult.successful_requests}/{geoResult.total_requests} requests successful
                      ({geoResult.success_rate}%)
                    </span>
                  </div>
                  <p className="text-sm">{geoResult.summary}</p>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">#</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          Requested
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Actual</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">IP</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Time</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {geoResult.results.map((result) => (
                        <tr key={result.request_number} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{result.request_number}</td>
                          <td className="px-4 py-2 font-medium">{result.requested_country}</td>
                          <td className="px-4 py-2 font-medium">{result.actual_country}</td>
                          <td className="px-4 py-2 font-mono text-xs">{result.ip_address}</td>
                          <td className="px-4 py-2">{result.response_time_ms}ms</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                                result.status === 'match'
                                  ? 'bg-green-100 text-green-700'
                                  : result.status === 'mismatch'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {getStatusIcon(result.status)}
                              {result.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
