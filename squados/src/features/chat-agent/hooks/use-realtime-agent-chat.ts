'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import type { Message } from '@/shared/types/database';

export function useRealtimeAgentChat(conversationId: string, initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const supabase = createClient();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`agent-chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  const addOptimisticMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const replaceOptimistic = (tempId: string, realMsg: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? realMsg : m)));
  };

  return { messages, addOptimisticMessage, replaceOptimistic };
}
