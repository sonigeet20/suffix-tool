import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, AlertCircle } from 'lucide-react';

interface Provider {
  id?: string;
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
}

interface ProviderModalProps {
  provider: Provider | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PROVIDER_TEMPLATES = {
  brightdata: {
    name: 'Bright Data',
    host: 'brd.superproxy.io',
    port: 22225,
    username: 'brd-customer-YOUR_ID-zone-ZONE_NAME',
    api_endpoint_example: 'https://brightdata.com/api/v2/zone/ips',
    curl_example: 'curl -x brd.superproxy.io:22225 -U "brd-customer-{id}-zone-{zone}-country-{country}:{pass}" https://lumtest.com/myip.json',
  },
  oxylabs: {
    name: 'Oxylabs',
    host: 'pr.oxylabs.io',
    port: 7777,
    username: 'customer-USERNAME-cc-COUNTRY',
    api_endpoint_example: 'https://api.oxylabs.io/v1/queries',
    curl_example: 'curl -x pr.oxylabs.io:7777 -U "customer-{username}-cc-{country}:{pass}" https://ip.oxylabs.io/location',
  },
  smartproxy: {
    name: 'Smartproxy',
    host: 'gate.smartproxy.com',
    port: 7000,
    username: 'user-USERNAME-country-COUNTRY',
    api_endpoint_example: 'https://api.smartproxy.com/v2/stats',
    curl_example: 'curl -x gate.smartproxy.com:7000 -U "user-{username}-country-{country}:{pass}" https://ip.smartproxy.com/json',
  },
  luna: {
    name: 'Luna Proxy',
    host: 'customer-USERNAME.proxy.lunaproxy.com',
    port: 12233,
    username: 'username',
    api_endpoint_example: '',
    curl_example: '',
  },
  custom: {
    name: 'Custom Provider',
    host: '',
    port: 8080,
    username: '',
    api_endpoint_example: 'https://api.example.com/endpoint',
    curl_example: 'curl -x proxy.example.com:port -U "user-{customer_id}-country-{country}:pass" https://ipapi.co/json/',
  },
};

export default function ProviderModal({ provider, onClose, onSuccess }: ProviderModalProps) {
  const [formData, setFormData] = useState<Provider>({
    name: '',
    provider_type: 'custom',
    host: '',
    port: 8080,
    username: '',
    password: '',
    api_endpoint_example: '',
    curl_example: '',
    priority: 50,
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      setFormData({
        ...provider,
        api_endpoint_example: provider.api_endpoint_example || '',
        curl_example: provider.curl_example || '',
      });
    }
  }, [provider]);

  const applyTemplate = (type: string) => {
    const template = PROVIDER_TEMPLATES[type as keyof typeof PROVIDER_TEMPLATES];
    if (template) {
      setFormData({
        ...formData,
        provider_type: type,
        name: formData.name || template.name,
        host: template.host,
        port: template.port,
        username: template.username,
        api_endpoint_example: template.api_endpoint_example,
        curl_example: template.curl_example,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-providers`;
      const method = provider ? 'PUT' : 'POST';
      const body = provider ? { id: provider.id, ...formData } : formData;

      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save provider');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {provider ? 'Edit Provider' : 'Add Proxy Provider'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider Type
            </label>
            <select
              value={formData.provider_type}
              onChange={(e) => {
                setFormData({ ...formData, provider_type: e.target.value });
                applyTemplate(e.target.value);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            >
              <option value="custom">Custom</option>
              <option value="brightdata">Bright Data</option>
              <option value="oxylabs">Oxylabs</option>
              <option value="smartproxy">Smartproxy</option>
              <option value="luna">Luna Proxy</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Select a provider type to auto-fill common configurations
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="My Proxy Provider"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proxy Host
              </label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                placeholder="proxy.example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="8080"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                placeholder="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                placeholder="password"
                required
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">
              Documentation References (Optional)
            </h3>
            <p className="text-xs text-blue-800 mb-3">
              These fields are for your reference only and help document the provider's API format. They are not used in actual requests.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Endpoint Example
                </label>
                <input
                  type="text"
                  value={formData.api_endpoint_example}
                  onChange={(e) =>
                    setFormData({ ...formData, api_endpoint_example: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-xs"
                  placeholder="https://api.provider.com/endpoint"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Example API endpoint to understand provider's API format
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  cURL Example
                </label>
                <textarea
                  value={formData.curl_example}
                  onChange={(e) =>
                    setFormData({ ...formData, curl_example: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-xs"
                  placeholder='curl -x proxy:port -U "user-{country}:pass" https://ipapi.co/json/'
                />
                <p className="mt-1 text-xs text-gray-500">
                  Example cURL command showing format with placeholders like {'{country}'}, {'{session}'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority (1-100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Higher priority providers are preferred in rotation
              </p>
            </div>
            <div className="flex items-center pt-6">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="enabled" className="ml-2 text-sm font-medium text-gray-700">
                Enable provider
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
