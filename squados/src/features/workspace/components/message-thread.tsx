'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send } from 'lucide-react';
import { sendMessageAction } from '../actions/workspace-actions';
import { useRealtimeMessages } from '../hooks/use-realtime-messages';
import { useTypingIndicator } from '../hooks/use-typing-indicator';
import type { Message } from '@/shared/types/database';

interface MessageWithSender extends Message {
  sender?: { id: string; full_name: string; avatar_url: string | null } | null;
}

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  title: string;
  initialMessages: MessageWithSender[];
}

export function MessageThread({
  conversationId,
  currentUserId,
  currentUserName,
  title,
  initialMessages,
}: MessageThreadProps) {
  const { messages, addOptimisticMessage, replaceOptimisticMessage } =
    useRealtimeMessages(conversationId, initialMessages);
  const { typingUsers, startTyping, stopTyping } =
    useTypingIndicator(conversationId, currentUserId, currentUserName);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);
    stopTyping();

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      sender_type: 'user',
      content,
      content_type: 'text',
      metadata: {},
      reply_to_id: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      sender: { id: currentUserId, full_name: currentUserName, avatar_url: null },
    });

    const result = await sendMessageAction({
      conversation_id: conversationId,
      content,
    });

    if (result.data) {
      replaceOptimisticMessage(tempId, { ...result.data, sender: null });
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    if (e.target.value.trim()) {
      startTyping();
    } else {
      stopTyping();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {msg.sender?.full_name
                        ?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .slice(0, 2) || '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] rounded-lg px-3 py-2 ${
                    isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {!isMe && msg.sender && (
                    <p className="text-xs font-medium mb-1">{msg.sender.full_name}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className="mt-1 text-xs opacity-60">
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
          {typingUsers.map((u) => u.userName).join(', ')}{' '}
          {typingUsers.length === 1 ? 'está digitando...' : 'estão digitando...'}
        </div>
      )}

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={sending || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
