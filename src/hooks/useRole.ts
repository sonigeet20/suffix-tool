import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'viewer' | null;

export function useRole() {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Supabase query error:', error);
        // Log more details for debugging
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        setRole(null);
      } else if (data) {
        setRole(data.role as UserRole);
      } else {
        // No data found, but no error - this means the user profile doesn't exist
        console.warn('No user profile found for user:', user.id);
        setRole(null);
      }
    } catch (err) {
      console.error('Error fetching role:', err);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  return { role, loading, isAdmin: role === 'admin', isViewer: role === 'viewer', refetch: fetchRole };
}
