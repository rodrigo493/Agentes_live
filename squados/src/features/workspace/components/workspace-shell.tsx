'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Search,
  Send,
  MessageSquare,
  Users,
  Plus,
  Hash,
  User,
} from 'lucide-react';
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
import type { UserRole, Conversation } from '@/shared/types/database';

interface Contact {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string | null;
  sector_id: string | null;
}

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: string;
  content: string;
  content_type: string;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  sender?: { id: string; full_name: string; avatar_url: string | null } | null;
}

type SidebarTab = 'conversations' | 'contacts';

interface ActiveChat {
  type: 'dm' | 'group';
  conversationId: string;
  title: string;
  contactId?: string;
}

interface WorkspaceShellProps {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: UserRole;
  contacts: Contact[];
  conversations: Conversation[];
  groups: GroupInfo[];
  isAdmin: boolean;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function WorkspaceShell({
  currentUserId,
  currentUserName,
  contacts,
  conversations: initialConversations,
  groups: initialGroups,
  isAdmin,
}: WorkspaceShellProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<SidebarTab>('conversations');
  const [search, setSearch] = useState('');
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [groups, setGroups] = useState(initialGroups);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { notify } = useDesktopNotifications();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to realtime messages for active chat
  useEffect(() => {
    if (!activeChat?.conversationId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`ws-messages:${activeChat.conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeChat.conversationId}`,
        },
        async (payload) => {
          const msg = payload.new as MessageRow;
          // Skip if we already have it (optimistic)
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            // Fetch sender info
            const contact = contacts.find((c) => c.id === msg.sender_id);
            return [
              ...prev,
              {
                ...msg,
                sender: contact
                  ? { id: contact.id, full_name: contact.full_name, avatar_url: contact.avatar_url }
                  : msg.sender_id === currentUserId
                    ? { id: currentUserId, full_name: currentUserName, avatar_url: null }
                    : null,
              },
            ];
          });

          // Desktop notification for messages from other users
          if (msg.sender_id !== currentUserId) {
            const contact = contacts.find((c) => c.id === msg.sender_id);
            const senderName = contact?.full_name ?? 'Alguém';
            notify(`💬 ${senderName}`, msg.content, '/workspace');
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat?.conversationId, contacts, currentUserId, currentUserName, supabase]);

  // Open DM with a contact
  const openDM = useCallback(
    async (contact: Contact) => {
      setLoadingChat(true);

      // Check if DM conversation already exists
      let conv = conversations.find(
        (c) =>
          c.type === 'dm' &&
          c.participant_ids.includes(currentUserId) &&
          c.participant_ids.includes(contact.id) &&
          c.participant_ids.length === 2
      );

      if (!conv) {
        // Create DM conversation via admin client (server action)
        const res = await fetch('/api/workspace/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otherUserId: contact.id }),
        });
        const data = await res.json();
        if (data.conversation) {
          conv = data.conversation;
          setConversations((prev) => [data.conversation, ...prev]);
        }
      }

      if (conv) {
        setActiveChat({
          type: 'dm',
          conversationId: conv.id,
          title: contact.full_name,
          contactId: contact.id,
        });
        await loadMessages(conv.id);
      }

      setLoadingChat(false);
    },
    [conversations, currentUserId]
  );

  // Open group chat
  const openGroup = useCallback(
    async (group: GroupInfo) => {
      setLoadingChat(true);

      const conv = conversations.find(
        (c) => c.type === 'group' && c.group_id === group.id
      );

      if (conv) {
        setActiveChat({
          type: 'group',
          conversationId: conv.id,
          title: group.name,
        });
        await loadMessages(conv.id);
      }

      setLoadingChat(false);
    },
    [conversations]
  );

  // Resume existing conversation
  const openConversation = useCallback(
    async (conv: Conversation) => {
      setLoadingChat(true);

      let title = conv.title || 'Conversa';
      if (conv.type === 'dm') {
        const otherId = conv.participant_ids.find((id) => id !== currentUserId);
        const other = contacts.find((c) => c.id === otherId);
        title = other?.full_name ?? 'Usuário';
      }

      setActiveChat({
        type: conv.type as 'dm' | 'group',
        conversationId: conv.id,
        title,
        contactId: conv.type === 'dm'
          ? conv.participant_ids.find((id) => id !== currentUserId)
          : undefined,
      });
      await loadMessages(conv.id);
      setLoadingChat(false);
    },
    [contacts, currentUserId]
  );

  async function loadMessages(conversationId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages(data ?? []);
  }

  async function handleSend() {
    if (!input.trim() || sending || !activeChat) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversation_id: activeChat.conversationId,
        sender_id: currentUserId,
        sender_type: 'user',
        content,
        content_type: 'text',
        is_deleted: false,
        created_at: new Date().toISOString(),
        edited_at: null,
        sender: { id: currentUserId, full_name: currentUserName, avatar_url: null },
      },
    ]);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeChat.conversationId,
        sender_id: currentUserId,
        sender_type: 'user',
        content,
        content_type: 'text',
      })
      .select()
      .single();

    if (data) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...data, sender: { id: currentUserId, full_name: currentUserName, avatar_url: null } }
            : m
        )
      );
    } else if (error) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setCreatingGroup(true);

    const res = await fetch('/api/workspace/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupName.trim(),
        description: groupDesc.trim() || null,
        member_ids: selectedMembers,
      }),
    });

    const data = await res.json();
    if (data.group && data.conversation) {
      setGroups((prev) => [...prev, data.group]);
      setConversations((prev) => [data.conversation, ...prev]);
      setCreateGroupOpen(false);
      setGroupName('');
      setGroupDesc('');
      setSelectedMembers([]);
    }

    setCreatingGroup(false);
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  // Filtered contacts
  const filteredContacts = contacts.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  // Conversation list with resolved names
  const conversationList = conversations
    .filter((c) => c.type === 'dm' || c.type === 'group')
    .map((conv) => {
      let title = conv.title || 'Conversa';
      if (conv.type === 'dm') {
        const otherId = conv.participant_ids.find((id) => id !== currentUserId);
        const other = contacts.find((c) => c.id === otherId);
        title = other?.full_name ?? 'Usuário';
      }
      return { ...conv, resolvedTitle: title };
    });

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ===== LEFT SIDEBAR ===== */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Workspace</h2>
            {isAdmin && (
              <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
                <DialogTrigger
                  className="group/button inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9"
                  title="Criar Grupo"  
                 >    
                    <Plus className="h-4 w-4" />
                 </DialogTrigger> 
                
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Criar Grupo</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome do grupo</Label>
                      <Input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Ex: Equipe Financeiro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição (opcional)</Label>
                      <Input
                        value={groupDesc}
                        onChange={(e) => setGroupDesc(e.target.value)}
                        placeholder="Descrição do grupo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Membros ({selectedMembers.length} selecionados)</Label>
                      <ScrollArea className="h-48 rounded-md border p-2">
                        {contacts.map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMembers.includes(c.id)}
                              onChange={() => toggleMember(c.id)}
                              className="rounded"
                            />
                            <span className="text-sm">{c.full_name}</span>
                            <Badge variant="secondary" className="text-[10px] ml-auto">
                              {c.role.replace('_', ' ')}
                            </Badge>
                          </label>
                        ))}
                      </ScrollArea>
                    </div>
                    <Button
                      onClick={handleCreateGroup}
                      disabled={creatingGroup || !groupName.trim() || selectedMembers.length === 0}
                      className="w-full"
                    >
                      {creatingGroup ? 'Criando...' : 'Criar Grupo'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setTab('conversations')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                tab === 'conversations'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Conversas
            </button>
            <button
              onClick={() => setTab('contacts')}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                tab === 'contacts'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Contatos
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={tab === 'contacts' ? 'Buscar contatos...' : 'Buscar conversas...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 h-9 rounded-md border border-input bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Groups - always visible at top */}
        {groups.length > 0 && (
          <div className="border-b border-border">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Grupos
              </span>
              <Badge variant="secondary" className="text-[9px]">{groups.length}</Badge>
            </div>
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => openGroup(group)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left ${
                  activeChat?.title === group.name && activeChat?.type === 'group'
                    ? 'bg-muted'
                    : ''
                }`}
              >
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Hash className="w-3.5 h-3.5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{group.name}</span>
                  {group.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{group.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* List - Conversations or Contacts */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'contacts' && (
            <>
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => openDM(contact)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 ${
                    activeChat?.contactId === contact.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(contact.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {contact.status === 'active' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate">{contact.full_name}</span>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0 capitalize">
                        {contact.role.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                  </div>
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum contato encontrado.
                </div>
              )}
            </>
          )}

          {tab === 'conversations' && (
            <>
              {conversationList
                .filter((c) => c.type === 'dm')
                .filter((c) => c.resolvedTitle.toLowerCase().includes(search.toLowerCase()))
                .map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 ${
                      activeChat?.conversationId === conv.id ? 'bg-muted' : ''
                    }`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(conv.resolvedTitle)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate">{conv.resolvedTitle}</span>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {new Date(conv.last_message_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}

              {conversationList.filter((c) => c.type === 'dm').length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma conversa ainda.</p>
                  <p className="mt-1">Clique em Contatos para iniciar.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== RIGHT PANEL - CHAT ===== */}
      <div className="flex-1 flex flex-col bg-background">
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha um contato ou grupo para iniciar
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-3">
              {activeChat.type === 'dm' ? (
                <User className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Users className="w-5 h-5 text-muted-foreground" />
              )}
              <h2 className="font-semibold">{activeChat.title}</h2>
              <Badge variant="outline" className="text-[10px]">
                {activeChat.type === 'dm' ? 'Mensagem direta' : 'Grupo'}
              </Badge>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingChat ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nenhuma mensagem ainda. Diga oi!
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => {
                    const isMe = msg.sender_id === currentUserId;
                    const senderName = isMe
                      ? currentUserName
                      : msg.sender?.full_name ?? 'Usuário';

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMe && (
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(senderName)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            isMe
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {!isMe && activeChat.type === 'group' && (
                            <p className="text-xs font-medium mb-1 opacity-70">
                              {senderName}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p className="mt-1 text-[10px] opacity-60">
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
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem..."
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  size="icon"
                  className="flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
