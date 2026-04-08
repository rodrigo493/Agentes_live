'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import type { Message } from '@/shared/types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeMessage extends Message {
  sender?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export function useRealtimeMessages(conversationId: string, initialMessages: RealtimeMessage[]) {
  const [messages, setMessages] = useState<RealtimeMessage[]>(initialMessages);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    // Subscribe to new messages in this conversation
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Fetch sender profile for the new message
          let sender = null;
          if (newMessage.sender_id) {
            const { data } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .eq('id', newMessage.sender_id)
              .single();
            sender = data;
          }

          setMessages((prev) => {
            // Avoid duplicates (optimistic updates may have added it)
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, { ...newMessage, sender }];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  const addOptimisticMessage = useCallback((message: RealtimeMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const replaceOptimisticMessage = useCallback((tempId: string, realMessage: RealtimeMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? realMessage : m)));
  }, []);

  return { messages, addOptimisticMessage, replaceOptimisticMessage };
}
