import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Save, AlertCircle, CheckCircle, Globe, TestTube } from 'lucide-react';
import ProvidersSection from './ProvidersSection';
import UserManagement from './UserManagement';
import { useRole } from '../hooks/useRole';

interface ProxySettings {
  id?: string;
  user_id?: string;
  aws_proxy_url: string;
  luna_proxy_host: string;
  luna_proxy_port: string;
  luna_proxy_username: string;
  luna_proxy_password: string;
  ip_cooldown_seconds: number | null;
  proxy_rotation_mode: string | null;
  proxy_failover_enabled: boolean | null;
}

export default function SettingsContent() {
  const { isAdmin } = useRole();
  const [settings, setSettings] = useState<ProxySettings>({
    aws_proxy_url: '',
    luna_proxy_host: '',
    luna_proxy_port: '',
    luna_proxy_username: '',
    luna_proxy_password: '',
    ip_cooldown_seconds: 60,
    proxy_rotation_mode: 'sequential',
    proxy_failover_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setSettings({
        ...data,
        luna_proxy_port: data.luna_proxy_port ? String(data.luna_proxy_port) : '',
        ip_cooldown_seconds: data.ip_cooldown_seconds ?? 60,
        proxy_rotation_mode: data.proxy_rotation_mode ?? 'sequential',
        proxy_failover_enabled: data.proxy_failover_enabled ?? true,
      });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const settingsData = {
        aws_proxy_url: settings.aws_proxy_url || null,
        luna_proxy_host: settings.luna_proxy_host,
        luna_proxy_port: settings.luna_proxy_port ? parseInt(settings.luna_proxy_port) : null,
        luna_proxy_username: settings.luna_proxy_username,
        luna_proxy_password: settings.luna_proxy_password,
        ip_cooldown_seconds: settings.ip_cooldown_seconds,
        proxy_rotation_mode: settings.proxy_rotation_mode,
        proxy_failover_enabled: settings.proxy_failover_enabled,
      };

      if (settings.id) {
        const { error } = await supabase
          .from('settings')
          .update(settingsData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert([{
          user_id: user.id,
          ...settingsData,
        }]);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: 'Proxy settings saved successfully!' });
      await fetchSettings();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const testProxy = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-proxy`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        if (data.proxy_working) {
          setMessage({ type: 'success', text: 'Proxy is working correctly!' });
        } else {
          setMessage({ type: 'error', text: 'Proxy not working - IPs are the same!' });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to test proxy' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to test proxy' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">Loading settings...</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
        Only admins can access settings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <UserManagement />

      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Globe className="text-brand-600 dark:text-brand-400" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Luna Proxy Settings</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Configure Luna Proxy API or Residential Proxy for all offers
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-300'
                : 'bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-brand-50 dark:bg-brand-900/20 p-4 rounded-lg border border-brand-200 dark:border-brand-800/50">
            <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-300 mb-3">AWS Proxy Service (Recommended for Luna Residential)</h3>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                AWS Proxy Service URL
              </label>
              <input
                type="text"
                value={settings.aws_proxy_url}
                onChange={(e) =>
                  setSettings({ ...settings, aws_proxy_url: e.target.value })
                }
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth font-mono text-sm placeholder-neutral-400 dark:placeholder-neutral-500"
                placeholder="http://your-ec2-instance:3000"
              />
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Use your AWS EC2 proxy service that handles Luna residential proxy routing. If set, this will be used instead of direct Luna API calls.
              </p>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-850 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Luna Residential Proxy Credentials</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Proxy Host
                  </label>
                  <input
                    type="text"
                    value={settings.luna_proxy_host}
                    onChange={(e) =>
                      setSettings({ ...settings, luna_proxy_host: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth font-mono text-xs placeholder-neutral-400 dark:placeholder-neutral-500"
                    placeholder="customer-USERNAME.proxy.lunaproxy.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Port
                  </label>
                  <input
                    type="text"
                    value={settings.luna_proxy_port}
                    onChange={(e) =>
                      setSettings({ ...settings, luna_proxy_port: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth font-mono text-sm placeholder-neutral-400 dark:placeholder-neutral-500"
                    placeholder="12233"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={settings.luna_proxy_username}
                    onChange={(e) =>
                      setSettings({ ...settings, luna_proxy_username: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth font-mono text-sm placeholder-neutral-400 dark:placeholder-neutral-500"
                    placeholder="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={settings.luna_proxy_password}
                    onChange={(e) =>
                      setSettings({ ...settings, luna_proxy_password: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth font-mono text-sm placeholder-neutral-400 dark:placeholder-neutral-500"
                    placeholder="password"
                  />
                </div>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Get residential proxy credentials from Luna Proxy dashboard → Residential Proxy section
              </p>
              <div className="mt-2 p-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800/50 rounded-lg">
                <p className="text-xs text-brand-800 dark:text-brand-300">
                  <strong>Setup:</strong> Use these credentials with the AWS Proxy Service above for the best performance and cost savings. These credentials are charged per GB of traffic (much cheaper than per-request pricing).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-850 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">IP Pool Configuration</h3>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                IP Cooldown Duration (seconds)
              </label>
              <input
                type="number"
                min="10"
                max="300"
                value={settings.ip_cooldown_seconds ?? 60}
                onChange={(e) =>
                  setSettings({ ...settings, ip_cooldown_seconds: parseInt(e.target.value) || 60 })
                }
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth placeholder-neutral-400 dark:placeholder-neutral-500"
                placeholder="60"
              />
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Time before an IP can be reused from the pool (default: 60 seconds, range: 10-300)
              </p>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth font-medium flex items-center justify-center gap-2 text-sm"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={testProxy}
              disabled={testing || !settings.luna_proxy_host}
              className="px-4 py-2.5 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth font-medium flex items-center justify-center gap-2 text-sm"
            >
              <TestTube size={18} />
              {testing ? 'Testing...' : 'Test Proxy'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <ProvidersSection
            rotationMode={settings.proxy_rotation_mode}
            failoverEnabled={settings.proxy_failover_enabled}
            onRotationModeChange={(mode) => {
              setSettings({ ...settings, proxy_rotation_mode: mode });
              handleSubmit(new Event('submit') as any);
            }}
            onFailoverEnabledChange={(enabled) => {
              setSettings({ ...settings, proxy_failover_enabled: enabled });
              handleSubmit(new Event('submit') as any);
            }}
          />
        </div>
      </div>
    </div>
  );
}
