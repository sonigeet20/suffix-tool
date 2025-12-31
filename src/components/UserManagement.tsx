import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Shield, Eye, Mail, Calendar, Loader, AlertCircle, CheckCircle } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('admin_create_user_invite', {
        user_email: newUserEmail,
        user_role: newUserRole,
      });

      if (error) throw error;

      setMessage({
        type: 'success',
        text: `Invitation created! The user can now sign up with email: ${newUserEmail}`,
      });
      setNewUserEmail('');
      setNewUserRole('viewer');
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to create invitation',
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'viewer') => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'User role updated successfully!' });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update role' });
    }
  };

  const adminCount = users.filter(u => u.role === 'admin').length;
  const viewerCount = users.filter(u => u.role === 'viewer').length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="text-brand-600 dark:text-brand-400" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">User Management</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Manage user accounts and roles
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

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="text-brand-600 dark:text-brand-400" size={20} />
              <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-300">Total Admins</h3>
            </div>
            <p className="text-3xl font-bold text-brand-700 dark:text-brand-400">{adminCount}</p>
          </div>

          <div className="bg-gradient-to-br from-success-50 to-success-100 dark:from-success-900/20 dark:to-success-800/20 rounded-lg p-4 border border-success-200 dark:border-success-800">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="text-success-600 dark:text-success-400" size={20} />
              <h3 className="text-sm font-semibold text-success-900 dark:text-success-300">Total Viewers</h3>
            </div>
            <p className="text-3xl font-bold text-success-700 dark:text-success-400">{viewerCount}</p>
          </div>
        </div>

        <form onSubmit={handleCreateInvite} className="mb-6 p-4 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-4">Create New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth placeholder-neutral-400 dark:placeholder-neutral-500"
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Role
              </label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'viewer')}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth font-medium"
          >
            {inviting ? (
              <>
                <Loader size={18} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Create User Account
              </>
            )}
          </button>
        </form>

        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-4">All Users</h3>
          {loading ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <Loader size={24} className="animate-spin mx-auto mb-2" />
              Loading users...
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-850 rounded-lg border border-neutral-200 dark:border-neutral-800"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-lg ${
                      user.role === 'admin'
                        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                        : 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400'
                    }`}>
                      {user.role === 'admin' ? <Shield size={20} /> : <Eye size={20} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-neutral-400 dark:text-neutral-500" />
                        <span className="font-medium text-neutral-900 dark:text-neutral-50">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <Calendar size={12} />
                        <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'viewer')}
                      className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 transition-smooth"
                    >
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
