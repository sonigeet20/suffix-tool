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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-brand-600 p-8 text-white text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg mx-auto mb-4">
              <Link2 size={24} />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Welcome Back</h1>
            <p className="text-white/80 text-sm">
              Sign in to your URL tracking dashboard
            </p>
          </div>

          <div className="p-8">
            <div className="mb-6 p-3 bg-brand-500/10 dark:bg-brand-500/20 border border-brand-500/30 dark:border-brand-500/40 rounded-lg flex items-start gap-3 text-brand-700 dark:text-brand-400 text-sm">
              <Info size={18} className="flex-shrink-0 mt-0.5" />
              <p>
                User accounts are created by administrators. Contact your admin if you need access.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 dark:border-red-500/40 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
                <AlertCircle size={19} className="flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 dark:focus:border-brand-500 outline-none transition-all"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 dark:focus:border-brand-500 outline-none transition-all"
                    placeholder="Enter your password"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          <p>Secure authentication powered by Supabase</p>
        </div>
      </div>
    </div>
  );
}
