'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Bot, User } from 'lucide-react';
import { sendAgentMessageAction } from '../actions/chat-agent-actions';
import { useRealtimeAgentChat } from '../hooks/use-realtime-agent-chat';
import type { Message } from '@/shared/types/database';

interface ChatInterfaceProps {
  conversationId: string;
  sectorName: string;
  initialMessages: Message[];
}

export function ChatInterface({ conversationId, sectorName, initialMessages }: ChatInterfaceProps) {
  const { messages, addOptimisticMessage, replaceOptimistic } =
    useRealtimeAgentChat(conversationId, initialMessages);
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

    const tempId = `temp-${Date.now()}`;
    addOptimisticMessage({
      id: tempId,
      conversation_id: conversationId,
      sender_id: 'me',
      sender_type: 'user',
      content,
      content_type: 'text',
      metadata: {},
      reply_to_id: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
    });

    const result = await sendAgentMessageAction(conversationId, content);

    if (result.data) {
      replaceOptimistic(tempId, result.data.userMessage);
      // Agent message will arrive via realtime subscription
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Agente {sectorName}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Assistente do setor — conhecimento acumulado
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Bot className="mb-4 h-12 w-12" />
              <p className="text-lg font-medium">Chat com Agente {sectorName}</p>
              <p className="text-sm">
                Faça perguntas sobre procedimentos, processos e conhecimento do setor.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender_type !== 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  msg.sender_type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="mt-1 text-xs opacity-60">
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {msg.sender_type === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
