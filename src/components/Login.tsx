import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link2, Mail, Lock, AlertCircle, Info } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-linear-bg flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-linear-panel rounded-lg shadow-xl border border-slate-200 dark:border-linear-border overflow-hidden animate-fade-in">
          <div className="bg-gradient-to-r from-primary-500 to-accent-500 p-8 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
            <div className="relative flex items-center justify-center w-14 h-14 bg-white/15 backdrop-blur-sm rounded-xl mx-auto mb-4 shadow-glow">
              <Link2 size={28} />
            </div>
            <h1 className="relative text-2xl font-semibold mb-1 tracking-tight">Welcome Back</h1>
            <p className="relative text-white/80 text-sm">
              Sign in to your URL tracking dashboard
            </p>
          </div>

          <div className="p-8">
            <div className="mb-6 p-3 bg-primary-500/5 dark:bg-primary-500/10 border border-primary-500/20 rounded-lg flex items-start gap-3 text-primary-600 dark:text-primary-400 text-sm">
              <Info size={18} className="flex-shrink-0 mt-0.5" />
              <p>
                User accounts are created by administrators. Contact your admin if you need access.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-status-error/10 border border-status-error/30 rounded-lg flex items-center gap-3 text-status-error animate-slide-down">
                <AlertCircle size={19} className="flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-linear-border rounded-lg bg-white dark:bg-linear-bg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-linear-border rounded-lg bg-white dark:bg-linear-bg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                    placeholder="Enter your password"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-accent-500 text-white py-2.5 rounded-lg font-medium hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-lg flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          <p>Secure authentication powered by Supabase</p>
        </div>
      </div>
    </div>
  );
}
