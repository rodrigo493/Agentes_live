'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Pencil,
} from 'lucide-react';
import { EditGroupModal } from './edit-group-modal';
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
  avatar_url: string | null;
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

function sortByLastMessage(convs: Conversation[]): Conversation[] {
  return [...convs].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
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
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    sortByLastMessage(initialConversations)
  );
  const [groups, setGroups] = useState(initialGroups);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupInfo | null>(null);
  const [createGroupAvatarFile, setCreateGroupAvatarFile] = useState<File | null>(null);
  const [createGroupAvatarPreview, setCreateGroupAvatarPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { notify } = useDesktopNotifications();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Stable refs to avoid stale closures in global subscription
  const conversationsRef = useRef(conversations);
  const activeChatRef = useRef(activeChat);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Global notification subscription ──────────────────────────────────────
  // Listens to ALL new messages in any conversation the user belongs to.
  // Handles: desktop notification, unread badge, reorder conversation list.
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // CRITICAL: force Realtime to authenticate with the user's JWT.
      // createBrowserClient from @supabase/ssr does NOT do this automatically,
      // so the subscription runs as anon and RLS blocks ALL postgres_changes
      // events. Without setAuth, none of the notifications, reorder or unread
      // logic below is ever triggered.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      } else {
        console.warn('[ws-realtime] No session token available for realtime auth');
      }

      if (cancelled) return;

      const globalChannel = supabase
        .channel('ws-global-notifications')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new as MessageRow;
            console.debug('[ws-realtime] new message received', msg.id, msg.conversation_id);

            // Ignore own messages
            if (msg.sender_id === currentUserId) return;

            // Ignore if not a conversation we belong to
            const isMyConv = conversationsRef.current.some(
              (c) => c.id === msg.conversation_id
            );
            if (!isMyConv) return;

            // Update last_message_at and re-sort conversation list
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === msg.conversation_id
                  ? { ...c, last_message_at: msg.created_at }
                  : c
              );
              return sortByLastMessage(updated);
            });

            // Unread counter: so incrementa se NAO for a conversa aberta
            // (se ja ta lendo, nao faz sentido contar como nao-lida)
            if (msg.conversation_id !== activeChatRef.current?.conversationId) {
              setUnreadCounts((prev) => ({
                ...prev,
                [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
              }));
            }

            // Popup desktop: dispara SEMPRE (mesmo na conversa ativa)
            // Requisito do usuario: garantir que nenhuma mensagem passe despercebida
            const contact = contacts.find((c) => c.id === msg.sender_id);
            const senderName = contact?.full_name ?? 'Alguém';
            notify(`💬 ${senderName}`, msg.content, '/workspace', contact?.avatar_url);
          }
        )
        .subscribe((status, err) => {
          console.debug('[ws-realtime] subscription status:', status, err ?? '');
          if (status === 'CHANNEL_ERROR') {
            console.error('[ws-realtime] CHANNEL_ERROR — check RLS and publication:', err);
          } else if (status === 'TIMED_OUT') {
            console.error('[ws-realtime] TIMED_OUT — realtime connection failed');
          }
        });

      return () => {
        supabase.removeChannel(globalChannel);
      };
    }

    let cleanup: (() => void) | undefined;
    setup().then((fn) => { cleanup = fn; });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [currentUserId, contacts, notify, supabase]);

  // ── Per-chat subscription (active conversation only) ──────────────────────
  // Adds incoming messages to the thread in real time.
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
        (payload) => {
          const msg = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
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
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [activeChat?.conversationId, contacts, currentUserId, currentUserName, supabase]);

  // Open DM with a contact
  const openDM = useCallback(
    async (contact: Contact) => {
      setLoadingChat(true);

      let conv = conversationsRef.current.find(
        (c) =>
          c.type === 'dm' &&
          c.participant_ids.includes(currentUserId) &&
          c.participant_ids.includes(contact.id) &&
          c.participant_ids.length === 2
      );

      if (!conv) {
        const res = await fetch('/api/workspace/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otherUserId: contact.id }),
        });
        const data = await res.json();
        if (data.conversation) {
          conv = data.conversation;
          setConversations((prev) => sortByLastMessage([data.conversation, ...prev]));
        }
      }

      if (conv) {
        setActiveChat({
          type: 'dm',
          conversationId: conv.id,
          title: contact.full_name,
          contactId: contact.id,
        });
        setUnreadCounts((prev) => ({ ...prev, [conv!.id]: 0 }));
        await loadMessages(conv.id);
      }

      setLoadingChat(false);
    },
    [currentUserId]
  );

  // Open group chat
  const openGroup = useCallback(
    async (group: GroupInfo) => {
      setLoadingChat(true);

      const conv = conversationsRef.current.find(
        (c) => c.type === 'group' && c.group_id === group.id
      );

      if (conv) {
        setActiveChat({
          type: 'group',
          conversationId: conv.id,
          title: group.name,
        });
        setUnreadCounts((prev) => ({ ...prev, [conv.id]: 0 }));
        await loadMessages(conv.id);
      }

      setLoadingChat(false);
    },
    []
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
      setUnreadCounts((prev) => ({ ...prev, [conv.id]: 0 }));
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
      // Reorder conversation list with updated timestamp
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === activeChat.conversationId
            ? { ...c, last_message_at: data.created_at }
            : c
        );
        return sortByLastMessage(updated);
      });
    } else if (error) {
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

  function handleGroupUpdated(
    groupId: string,
    updated: Pick<GroupInfo, 'name' | 'description' | 'avatar_url'>
  ) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, ...updated } : g))
    );
    setActiveChat((prev) =>
      prev && prev.type === 'group' && prev.conversationId
        ? { ...prev, title: updated.name }
        : prev
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.type === 'group' && c.group_id === groupId
          ? { ...c, title: updated.name }
          : c
      )
    );
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
      // Upload avatar if selected
      let avatarUrl: string | null = null;
      if (createGroupAvatarFile) {
        const ext = createGroupAvatarFile.name.split('.').pop() ?? 'jpg';
        const path = `${data.group.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('group-avatars')
          .upload(path, createGroupAvatarFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('group-avatars').getPublicUrl(path);
          avatarUrl = urlData.publicUrl;
          // Save URL to group via server action
          const { updateGroupAction } = await import('../actions/group-actions');
          await updateGroupAction(data.group.id, { avatar_url: avatarUrl });
        }
      }

      setGroups((prev) => [...prev, { ...data.group, avatar_url: avatarUrl }]);
      setConversations((prev) => sortByLastMessage([data.conversation, ...prev]));
      setCreateGroupOpen(false);
      setGroupName('');
      setGroupDesc('');
      setSelectedMembers([]);
      setCreateGroupAvatarFile(null);
      setCreateGroupAvatarPreview(null);
    }

    setCreatingGroup(false);
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  const filteredContacts = contacts.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const conversationList = conversations
    .filter((c) => c.type === 'dm' || c.type === 'group')
    .map((conv) => {
      let title = conv.title || 'Conversa';
      let avatarUrl: string | null = null;
      if (conv.type === 'dm') {
        const otherId = conv.participant_ids.find((id) => id !== currentUserId);
        const other = contacts.find((c) => c.id === otherId);
        title = other?.full_name ?? 'Usuário';
        avatarUrl = other?.avatar_url ?? null;
      } else if (conv.type === 'group') {
        const g = groups.find((gr) => gr.id === conv.group_id);
        avatarUrl = g?.avatar_url ?? null;
      }
      return { ...conv, resolvedTitle: title, resolvedAvatar: avatarUrl };
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
                    {/* Imagem do grupo */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                      <div
                        className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                        onClick={() => document.getElementById('group-avatar-input')?.click()}
                      >
                        {createGroupAvatarPreview ? (
                          <img src={createGroupAvatarPreview} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                          <Hash className="w-5 h-5 text-violet-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1">
                          Imagem <span className="text-muted-foreground">(opcional)</span>
                        </p>
                        <label className="cursor-pointer">
                          <span className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent transition-colors">
                            Selecionar
                          </span>
                          <input
                            id="group-avatar-input"
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) return;
                              setCreateGroupAvatarFile(file);
                              setCreateGroupAvatarPreview(URL.createObjectURL(file));
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
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
            {groups.map((group) => {
              const groupConv = conversations.find(
                (c) => c.type === 'group' && c.group_id === group.id
              );
              const unread = groupConv ? (unreadCounts[groupConv.id] ?? 0) : 0;
              return (
                <button
                  key={group.id}
                  onClick={() => openGroup(group)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left ${
                    activeChat?.title === group.name && activeChat?.type === 'group'
                      ? 'bg-muted'
                      : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {group.avatar_url ? (
                      <img
                        src={group.avatar_url}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-violet-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>
                        {group.name}
                      </span>
                      {unread > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{group.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
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
                      {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.full_name} />}
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
                .map((conv) => {
                  const unread = unreadCounts[conv.id] ?? 0;
                  const isActive = activeChat?.conversationId === conv.id;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv)}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 ${
                        isActive ? 'bg-muted' : unread > 0 ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          {conv.resolvedAvatar && <AvatarImage src={conv.resolvedAvatar} alt={conv.resolvedTitle} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(conv.resolvedTitle)}
                          </AvatarFallback>
                        </Avatar>
                        {unread > 0 && !isActive && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm truncate ${unread > 0 && !isActive ? 'font-bold' : 'font-semibold'}`}>
                            {conv.resolvedTitle}
                          </span>
                          {conv.last_message_at && (
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {new Date(conv.last_message_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                        {unread > 0 && !isActive && (
                          <p className="text-[11px] text-primary font-medium">
                            {unread} mensagem{unread > 1 ? 'ns' : ''} não lida{unread > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}

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
              <h2 className="font-semibold flex-1">{activeChat.title}</h2>
              <Badge variant="outline" className="text-[10px]">
                {activeChat.type === 'dm' ? 'Mensagem direta' : 'Grupo'}
              </Badge>
              {activeChat.type === 'group' && isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5"
                  onClick={() => {
                    const group = groups.find(
                      (g) => conversations.find((c) => c.group_id === g.id && c.id === activeChat.conversationId)
                    );
                    if (group) {
                      setEditingGroup(group);
                      setEditGroupOpen(true);
                    }
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </Button>
              )}
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
                            {msg.sender?.avatar_url && <AvatarImage src={msg.sender.avatar_url} alt={senderName} />}
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

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          contacts={contacts}
          open={editGroupOpen}
          onClose={() => { setEditGroupOpen(false); setEditingGroup(null); }}
          onGroupUpdated={(updated) => handleGroupUpdated(editingGroup.id, updated)}
        />
      )}
    </div>
  );
}
