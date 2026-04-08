'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';

export function useOnlinePresence(currentUserId: string) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase.channel('online-users', {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  const isOnline = (userId: string) => onlineUsers.has(userId);

  return { onlineUsers, isOnline };
}
