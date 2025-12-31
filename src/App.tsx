import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { Link2, Settings as SettingsIcon, Activity, LogOut, Code2, Sun, Moon, Shield, Eye } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { useRole } from './hooks/useRole';
import Login from './components/Login';
import OfferList from './components/OfferList';
import Settings from './components/SettingsContent';
import Analytics from './components/Analytics';
import Scripts from './components/Scripts';

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const { role, loading: roleLoading } = useRole();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center transition-colors">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent mx-auto mb-3"></div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center transition-colors">
        <div className="text-center max-w-md p-6">
          <div className="mb-4 text-error-500">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">No User Role Assigned</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Your account doesn't have a role assigned yet. Please contact an administrator.
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-smooth text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = role === 'admin';

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800/50 shadow-sm dark:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 bg-brand-600 rounded-lg">
                <Link2 className="text-white" size={14} />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
                  URL Tracker
                </h1>
                <div className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium flex items-center gap-1 ${
                  isAdmin
                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20'
                    : 'bg-success-500/10 text-success-600 dark:text-success-400 border border-success-500/20'
                }`}>
                  {isAdmin ? <Shield size={9} /> : <Eye size={9} />}
                  {isAdmin ? 'ADMIN' : 'VIEWER'}
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-1">
              {isAdmin && (
                <Link
                  to="/"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-smooth ${
                    isActive('/')
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-850 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Link2 size={14} />
                  <span className="hidden lg:inline">Offers</span>
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/scripts"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-smooth ${
                    isActive('/scripts')
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-850 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Code2 size={14} />
                  <span className="hidden lg:inline">Scripts</span>
                </Link>
              )}
              <Link
                to="/analytics"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-smooth ${
                  isActive('/analytics')
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-850 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                <Activity size={14} />
                <span className="hidden lg:inline">Analytics</span>
              </Link>
              {isAdmin && (
                <Link
                  to="/settings"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-smooth ${
                    isActive('/settings')
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-850 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <SettingsIcon size={14} />
                  <span className="hidden lg:inline">Settings</span>
                </Link>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 rounded-md transition-smooth"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 rounded-md transition-smooth text-xs font-medium"
                aria-label="Logout"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          {isAdmin ? (
            <>
              <Route path="/" element={<OfferList />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Navigate to="/analytics" replace />} />
              <Route path="/analytics" element={<Analytics />} />
            </>
          )}
          <Route path="*" element={<Navigate to={isAdmin ? "/" : "/analytics"} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}
