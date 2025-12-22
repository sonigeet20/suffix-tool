import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Power, PowerOff, Edit2, Trash2, TestTube, AlertCircle } from 'lucide-react';
import ProviderModal from './ProviderModal';
import TestProviderModal from './TestProviderModal';

interface Provider {
  id: string;
  name: string;
  provider_type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  api_endpoint_example?: string;
  curl_example?: string;
  priority: number;
  enabled: boolean;
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
}

interface ProvidersSectionProps {
  rotationMode: string | null;
  failoverEnabled: boolean | null;
  onRotationModeChange: (mode: string) => void;
  onFailoverEnabledChange: (enabled: boolean) => void;
}

export default function ProvidersSection({
  rotationMode,
  failoverEnabled,
  onRotationModeChange,
  onFailoverEnabledChange,
}: ProvidersSectionProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.providers) {
        setProviders(data.providers);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to fetch providers' });
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = async (provider: Provider) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers`;
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: provider.id,
          enabled: !provider.enabled,
        }),
      });

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `Provider ${!provider.enabled ? 'enabled' : 'disabled'} successfully`,
        });
        fetchProviders();
      } else {
        throw new Error('Failed to toggle provider');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to toggle provider' });
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers`;
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: providerId }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Provider deleted successfully' });
        fetchProviders();
      } else {
        throw new Error('Failed to delete provider');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to delete provider' });
    }
  };

  const getSuccessRate = (provider: Provider) => {
    const total = provider.success_count + provider.failure_count;
    if (total === 0) return 0;
    return Math.round((provider.success_count / total) * 100);
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-900/30';
    if (rate >= 70) return 'text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-900/30';
    return 'text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-900/30';
  };

  return (
    <div className="space-y-5">
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-300'
              : 'bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300'
          }`}
        >
          <AlertCircle size={18} />
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Additional Proxy Providers</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Add multiple providers for rotation and redundancy. Luna proxy is always used as fallback.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingProvider(null);
              setShowModal(true);
            }}
            className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth font-medium flex items-center gap-2 text-sm"
          >
            <Plus size={18} />
            Add Provider
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">Loading providers...</div>
        ) : providers.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
            No additional providers configured. Luna proxy will be used as the only provider.
          </div>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => {
              const successRate = getSuccessRate(provider);
              return (
                <div
                  key={provider.id}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-smooth"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{provider.name}</h4>
                        <span className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded">
                          {provider.provider_type}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${getSuccessRateColor(successRate)}`}>
                          {successRate}% success
                        </span>
                        {provider.enabled ? (
                          <span className="text-xs px-2 py-1 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 rounded">
                            Enabled
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
                        <div>
                          <span className="font-medium">Host:</span> {provider.host}:{provider.port}
                        </div>
                        <div>
                          <span className="font-medium">Priority:</span> {provider.priority}
                        </div>
                        <div>
                          <span className="font-medium">Stats:</span> {provider.success_count} success,{' '}
                          {provider.failure_count} failures
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setTestingProvider(provider);
                          setShowTestModal(true);
                        }}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Test connection"
                      >
                        <TestTube size={18} />
                      </button>
                      <button
                        onClick={() => toggleProvider(provider)}
                        className={`p-2 rounded-lg transition-colors ${
                          provider.enabled
                            ? 'text-yellow-600 hover:bg-yellow-50'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={provider.enabled ? 'Disable' : 'Enable'}
                      >
                        {provider.enabled ? <PowerOff size={18} /> : <Power size={18} />}
                      </button>
                      <button
                        onClick={() => {
                          setEditingProvider(provider);
                          setShowModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => deleteProvider(provider.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {providers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Proxy Rotation Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rotation Mode
              </label>
              <select
                value={rotationMode || 'sequential'}
                onChange={(e) => onRotationModeChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="sequential">Sequential (priority order)</option>
                <option value="random">Random (pick randomly)</option>
                <option value="weighted">Weighted (probability by priority)</option>
                <option value="failover">Failover (primary until failure)</option>
              </select>
              <p className="mt-2 text-sm text-gray-600">
                {rotationMode === 'sequential' && 'Providers are used in priority order, highest first'}
                {rotationMode === 'random' && 'A random provider is selected for each request'}
                {rotationMode === 'weighted' &&
                  'Higher priority providers are more likely to be selected'}
                {rotationMode === 'failover' && 'Primary provider used until failure, then next'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="failoverEnabled"
                checked={failoverEnabled ?? true}
                onChange={(e) => onFailoverEnabledChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="failoverEnabled" className="text-sm font-medium text-gray-700">
                Enable automatic failover to next provider on error
              </label>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <ProviderModal
          provider={editingProvider}
          onClose={() => {
            setShowModal(false);
            setEditingProvider(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingProvider(null);
            fetchProviders();
            setMessage({
              type: 'success',
              text: editingProvider ? 'Provider updated successfully' : 'Provider added successfully',
            });
          }}
        />
      )}

      {showTestModal && testingProvider && (
        <TestProviderModal
          provider={testingProvider}
          onClose={() => {
            setShowTestModal(false);
            setTestingProvider(null);
          }}
        />
      )}
    </div>
  );
}
