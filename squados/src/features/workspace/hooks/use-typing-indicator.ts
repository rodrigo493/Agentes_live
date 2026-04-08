'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/shared/lib/supabase/client';

interface TypingUser {
  userId: string;
  userName: string;
}

export function useTypingIndicator(conversationId: string, currentUserId: string, currentUserName: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const supabase = createClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: TypingUser[] = [];
        for (const [userId, presences] of Object.entries(state)) {
          if (userId === currentUserId) continue;
          const presence = (presences as Array<{ typing?: boolean; userName?: string }>)[0];
          if (presence?.typing) {
            users.push({ userId, userName: presence.userName || 'Alguém' });
          }
        }
        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ typing: false, userName: currentUserName });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, currentUserName, supabase]);

  const startTyping = useCallback(() => {
    const channel = supabase.channel(`typing:${conversationId}`);
    channel.track({ typing: true, userName: currentUserName });

    // Auto-stop after 3 seconds
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      channel.track({ typing: false, userName: currentUserName });
    }, 3000);
  }, [conversationId, currentUserName, supabase]);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const channel = supabase.channel(`typing:${conversationId}`);
    channel.track({ typing: false, userName: currentUserName });
  }, [conversationId, currentUserName, supabase]);

  return { typingUsers, startTyping, stopTyping };
}
