'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot,
  Send,
  Paperclip,
  FileText,
  Brain,
  X,
  File,
  User,
  BookOpen,
  Sparkles,
  Mic,
  MicOff,
  Loader2,
  Square,
} from 'lucide-react';
import { sendAgentMessageAction } from '../actions/chat-agent-actions';
import { useVoiceChat } from '../hooks/use-voice-chat';
import type { Message } from '@/shared/types/database';

interface KnowledgeDoc {
  id: string;
  title: string;
  doc_type: string;
  tags: string[];
  created_at: string;
}

interface KnowledgeMemoryItem {
  id: string;
  title: string;
  category: string;
  confidence_score: number;
  tags: string[];
  created_at: string;
}

interface SectorOption {
  id: string;
  name: string;
  slug: string;
}

interface AgentChatShellProps {
  currentUserId: string;
  currentUserName: string;
  sectorId: string;
  sectorName: string;
  agentName: string;
  conversationId: string;
  initialMessages: Message[];
  knowledgeDocs: KnowledgeDoc[];
  knowledgeMemory: KnowledgeMemoryItem[];
  availableSectors?: SectorOption[];
}

const docTypeLabels: Record<string, string> = {
  transcript: 'Transcrição',
  document: 'Documento',
  procedure: 'Procedimento',
  manual: 'Manual',
  note: 'Anotação',
  other: 'Outro',
};

const categoryLabels: Record<string, string> = {
  procedure: 'Procedimento',
  policy: 'Política',
  technical: 'Técnico',
  operational: 'Operacional',
  decision: 'Decisão',
  lesson_learned: 'Lição Aprendida',
  faq: 'FAQ',
  general: 'Geral',
};

export function AgentChatShell({
  currentUserId,
  currentUserName,
  sectorName,
  agentName,
  conversationId,
  initialMessages,
  knowledgeDocs,
  knowledgeMemory,
  availableSectors = [],
}: AgentChatShellProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const voice = useVoiceChat();
  const lastInputWasVoiceRef = useRef<boolean>(false);
  const lastAgentMsgIdRef = useRef<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string }[]>([]);
  const [showKnowledge, setShowKnowledge] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-TTS: speak agent reply when last input was via voice
  useEffect(() => {
    if (!lastInputWasVoiceRef.current) return;
    const last = messages[messages.length - 1];
    if (!last || last.sender_type !== 'agent') return;
    if (lastAgentMsgIdRef.current === last.id) return;
    lastAgentMsgIdRef.current = last.id;
    voice.speak(last.content.replace(/\[IMAGE:[^\]]+\]/g, ''));
  }, [messages, voice]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

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
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  async function handleSend() {
    lastInputWasVoiceRef.current = false;
    if (!input.trim() || sending || !conversationId) return;

    let content = input.trim();

    // Append file contents if attached
    if (attachedFiles.length > 0) {
      const fileSection = attachedFiles
        .map((f) => `\n\n---\n**Arquivo: ${f.name}**\n\`\`\`\n${f.content}\n\`\`\``)
        .join('');
      content += fileSection;
    }

    setInput('');
    setAttachedFiles([]);
    setSending(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
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
      },
    ]);

    const result = await sendAgentMessageAction(conversationId, content);

    if (result.data) {
      // Replace optimistic with real, removing duplicates if realtime arrived first
      setMessages((prev) => {
        const realId = result.data!.userMessage.id;
        const alreadyExists = prev.some((m) => m.id === realId);
        if (alreadyExists) {
          // Realtime already added the real message; just remove the temp
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? result.data!.userMessage : m));
      });
      // Agent message arrives via realtime or add it directly
      if (result.data.agentMessage) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === result.data!.agentMessage!.id)) return prev;
          return [...prev, result.data!.agentMessage!];
        });
      }
    }

    setSending(false);
  }

  async function handleMicClick() {
    if (sending) return;
    if (voice.recording) {
      try {
        const text = await voice.stopRecording();
        if (text?.trim()) {
          lastInputWasVoiceRef.current = true;
          setInput('');
          setSending(true);

          const tempId = `temp-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: tempId,
              conversation_id: conversationId,
              sender_id: currentUserId,
              sender_type: 'user',
              content: text.trim(),
              content_type: 'text',
              metadata: {},
              reply_to_id: null,
              is_deleted: false,
              created_at: new Date().toISOString(),
              edited_at: null,
            },
          ]);

          const result = await sendAgentMessageAction(conversationId, text.trim());

          if (result.data) {
            setMessages((prev) => {
              const realId = result.data!.userMessage.id;
              const alreadyExists = prev.some((m) => m.id === realId);
              if (alreadyExists) {
                return prev.filter((m) => m.id !== tempId);
              }
              return prev.map((m) => (m.id === tempId ? result.data!.userMessage : m));
            });
            if (result.data.agentMessage) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === result.data!.agentMessage!.id)) return prev;
                return [...prev, result.data!.agentMessage!];
              });
            }
          }

          setSending(false);
        }
      } catch {
        lastInputWasVoiceRef.current = false;
        setSending(false);
      }
    } else {
      await voice.startRecording();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const maxSize = isPdf ? 1024 * 1024 * 20 : 1024 * 1024 * 2;
      if (file.size > maxSize) continue;

      if (isPdf) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch('/api/pdf-extract', { method: 'POST', body: fd });
          const j = await r.json();
          const text = (j.text ?? '').trim();
          if (text) {
            setAttachedFiles((prev) => [
              ...prev,
              { name: file.name, content: `[PDF extraído — ${j.pages ?? '?'} página(s)]\n\n${text}` },
            ]);
          }
        } catch {
          // ignore failed PDF
        }
      } else {
        const text = await file.text();
        setAttachedFiles((prev) => [...prev, { name: file.name, content: text }]);
      }
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const totalKnowledge = knowledgeDocs.length + knowledgeMemory.length;

  function renderMessageContent(content: string) {
    const parts = content.split(/(\[IMAGE:[^\]]+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[IMAGE:(.+)\]$/);
      if (match) {
        const url = match[1];
        if (!url.startsWith('https://')) return null;
        return (
          <img
            key={i}
            src={url}
            alt="Imagem do documento"
            className="rounded-lg max-w-full mt-2 border border-border"
            style={{ maxHeight: '400px', objectFit: 'contain' as const }}
          />
        );
      }
      return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null;
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ===== CHAT AREA ===== */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {agentName || `Agente ${sectorName}`}
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {availableSectors.length > 1 ? (
                  <select
                    className="text-[11px] text-muted-foreground bg-transparent border-none p-0 cursor-pointer focus:outline-none"
                    defaultValue={sectorName}
                    onChange={(e) => {
                      const sector = availableSectors.find((s) => s.name === e.target.value);
                      if (sector) window.location.href = `/chat?sector=${sector.slug}`;
                    }}
                  >
                    {availableSectors.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{sectorName}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Brain className="w-3 h-3" />
              {totalKnowledge} conhecimentos
            </Badge>
            <Button
              variant={showKnowledge ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs gap-1"
              onClick={() => setShowKnowledge(!showKnowledge)}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Base
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 bg-muted/20">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Agente {sectorName}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Faça perguntas sobre procedimentos, processos e conhecimento do setor.
                O agente tem acesso a {totalKnowledge} itens de conhecimento.
              </p>
              {totalKnowledge > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                  {knowledgeDocs.slice(0, 3).map((doc) => (
                    <Badge key={doc.id} variant="outline" className="text-[10px]">
                      {doc.title}
                    </Badge>
                  ))}
                  {totalKnowledge > 3 && (
                    <Badge variant="secondary" className="text-[10px]">
                      +{totalKnowledge - 3} mais
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                const isUser = msg.sender_type === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2.5 ${
                        isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border'
                      }`}
                    >
                      {!isUser && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Sparkles className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-medium text-primary">Agente</span>
                        </div>
                      )}
                      {isUser ? (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="text-sm">
                          {renderMessageContent(msg.content)}
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] opacity-50">
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {isUser && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-2 bg-card border-t border-border">
            {attachedFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1.5 text-xs"
              >
                <File className="w-3 h-3 text-muted-foreground" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button onClick={() => removeFile(i)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.xml,.log,.pdf,.doc,.docx"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              title="Anexar arquivo para análise"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Pergunte ao agente de ${sectorName}...`}
              className="min-h-[44px] max-h-32 resize-none flex-1"
              rows={1}
              disabled={!conversationId}
            />
            {voice.speaking && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={voice.stopSpeaking}
                title="Parar áudio do agente"
              >
                <Square className="w-4 h-4" />
              </Button>
            )}
            <div className="relative flex-shrink-0">
              {voice.recording && (
                <>
                  <span className="absolute inset-0 rounded-md bg-red-500/40 animate-ping" />
                  <span className="absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    REC
                  </span>
                </>
              )}
              <Button
                type="button"
                variant={voice.recording ? 'destructive' : 'outline'}
                size="icon"
                className={`relative h-9 w-9 ${voice.recording ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(239,68,68,0.7)]' : ''}`}
                onClick={handleMicClick}
                disabled={voice.transcribing || sending}
                title={voice.recording ? 'Parar e enviar' : 'Falar para o agente'}
              >
                {voice.transcribing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : voice.recording
                  ? <MicOff className="w-4 h-4 animate-pulse" />
                  : <Mic className="w-4 h-4" />}
              </Button>
            </div>
            {voice.recording && (
              <div className="flex items-center gap-0.5 h-9 px-2">
                <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '600ms' }} />
                <span className="w-1 h-5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '100ms', animationDuration: '600ms' }} />
                <span className="w-1 h-7 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '600ms' }} />
                <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '600ms' }} />
                <span className="w-1 h-6 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '600ms' }} />
                <span className="text-[10px] font-medium text-red-600 ml-1 animate-pulse">Gravando...</span>
              </div>
            )}
            <Button
              onClick={handleSend}
              disabled={sending || !input.trim() || !conversationId}
              size="icon"
              className="h-9 w-9 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 pl-11">
            Enter para enviar, Shift+Enter para nova linha
            {attachedFiles.length > 0 && ` · ${attachedFiles.length} arquivo(s) anexado(s)`}
          </p>
        </div>
      </div>

      {/* ===== KNOWLEDGE SIDEBAR ===== */}
      {showKnowledge && (
        <div className="w-80 border-l border-border flex flex-col bg-card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Conhecimento do Setor
              </h3>
              <button
                onClick={() => setShowKnowledge(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{sectorName}</p>
          </div>

          <Tabs defaultValue="docs" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-3">
              <TabsTrigger value="docs" className="text-xs gap-1">
                <FileText className="w-3 h-3" />
                Documentos ({knowledgeDocs.length})
              </TabsTrigger>
              <TabsTrigger value="memory" className="text-xs gap-1">
                <Brain className="w-3 h-3" />
                Memória ({knowledgeMemory.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="docs" className="flex-1 overflow-y-auto px-4 pb-4 mt-0">
              {knowledgeDocs.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum documento neste setor.</p>
                  <p className="text-[11px] mt-1">
                    Importe transcrições na página de Setores.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {knowledgeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium line-clamp-2">{doc.title}</p>
                        <Badge variant="secondary" className="text-[9px] flex-shrink-0">
                          {docTypeLabels[doc.doc_type] ?? doc.doc_type}
                        </Badge>
                      </div>
                      {doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {doc.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] bg-muted px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[9px] text-muted-foreground mt-1.5">
                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="memory" className="flex-1 overflow-y-auto px-4 pb-4 mt-0">
              {knowledgeMemory.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma memória validada.</p>
                  <p className="text-[11px] mt-1">
                    Memórias são criadas a partir de conversas e documentos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {knowledgeMemory.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium line-clamp-2">{mem.title}</p>
                        <Badge variant="outline" className="text-[9px] flex-shrink-0">
                          {categoryLabels[mem.category] ?? mem.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${mem.confidence_score * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {Math.round(mem.confidence_score * 100)}%
                        </span>
                      </div>
                      {mem.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {mem.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] bg-muted px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
