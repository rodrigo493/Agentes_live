'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import type { Profile } from '@/shared/types/database';

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(data);
      setLoading(false);
    }

    getProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
      } else if (event === 'SIGNED_IN') {
        getProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return { profile, loading };
}
