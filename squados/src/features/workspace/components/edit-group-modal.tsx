'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, UserPlus, X } from 'lucide-react';
import {
  updateGroupAction,
  getGroupMembersAction,
  addGroupMemberAction,
  removeGroupMemberAction,
} from '../actions/group-actions';

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
}

interface Contact {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

interface GroupMember {
  user_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

interface EditGroupModalProps {
  group: GroupInfo;
  contacts: Contact[];
  open: boolean;
  onClose: () => void;
  onGroupUpdated: (updated: Pick<GroupInfo, 'name' | 'description' | 'avatar_url'>) => void;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function EditGroupModal({
  group,
  contacts,
  open,
  onClose,
  onGroupUpdated,
}: EditGroupModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<'info' | 'members'>('info');

  // Info tab
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(group.avatar_url);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  // Members tab
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [error, setError] = useState('');

  // Reset state when group changes
  useEffect(() => {
    setName(group.name);
    setDescription(group.description ?? '');
    setAvatarUrl(group.avatar_url);
    setAvatarPreview(null);
    setAvatarFile(null);
    setMembers([]);
    setTab('info');
    setError('');
  }, [group.id]);

  // Load members when switching to members tab
  useEffect(() => {
    if (tab === 'members' && open && members.length === 0) {
      loadMembers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open]);

  async function loadMembers() {
    setLoadingMembers(true);
    const result = await getGroupMembersAction(group.id);
    if ('data' in result) {
      setMembers(result.data as GroupMember[]);
    }
    setLoadingMembers(false);
  }

  function handleAvatarFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 2 MB.');
      return;
    }
    setError('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveInfo() {
    if (!name.trim()) return;
    setSavingInfo(true);
    setError('');

    let finalAvatarUrl = avatarUrl;

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() ?? 'jpg';
      const path = `${group.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('group-avatars')
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage.from('group-avatars').getPublicUrl(path);
        finalAvatarUrl = data.publicUrl;
      } else {
        setError('Erro ao enviar imagem. As outras alterações serão salvas.');
      }
    }

    const result = await updateGroupAction(group.id, {
      name: name.trim(),
      description: description.trim() || null,
      avatar_url: finalAvatarUrl,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      onGroupUpdated({
        name: name.trim(),
        description: description.trim() || null,
        avatar_url: finalAvatarUrl,
      });
    }
    setSavingInfo(false);
  }

  async function handleAddMember(userId: string) {
    setAddingMember(true);
    setError('');
    const result = await addGroupMemberAction(group.id, userId);
    if (result.error) {
      setError(result.error);
    } else {
      await loadMembers();
      setMemberSearch('');
    }
    setAddingMember(false);
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    setError('');
    const result = await removeGroupMemberAction(group.id, userId);
    if (result.error) {
      setError(result.error);
    } else {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
    setRemovingId(null);
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableContacts = contacts.filter(
    (c) =>
      !memberIds.has(c.id) &&
      c.full_name.toLowerCase().includes(memberSearch.toLowerCase())
  );
  const displayAvatar = avatarPreview ?? avatarUrl;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Editar Grupo</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border -mx-6 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('info')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'info'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Informações
          </button>
          <button
            onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'members'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Membros
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex-shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* ── Info tab ── */}
          {tab === 'info' && (
            <div className="space-y-4 py-2">
              {/* Group image */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-violet-500 text-xl font-bold">#</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Imagem do grupo</span>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors">
                      <Camera className="w-3 h-3" />
                      Trocar imagem
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, GIF · máx 2 MB</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nome do grupo</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do grupo"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Descrição{' '}
                  <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição do grupo"
                />
              </div>

              <Button
                onClick={handleSaveInfo}
                disabled={savingInfo || !name.trim()}
                className="w-full"
              >
                {savingInfo ? 'Salvando...' : 'Salvar Informações'}
              </Button>
            </div>
          )}

          {/* ── Members tab ── */}
          {tab === 'members' && (
            <div className="space-y-3 py-2">
              {loadingMembers ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Carregando membros...
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {members.length} membro{members.length !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-1.5">
                      {members.map((m) => {
                        const p = m.profiles;
                        const isCreator = m.role === 'admin';
                        return (
                          <div
                            key={m.user_id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-7 w-7 flex-shrink-0">
                                {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(p.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{p.full_name}</span>
                              {isCreator && (
                                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                  (criador)
                                </span>
                              )}
                            </div>
                            {!isCreator && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveMember(m.user_id)}
                                disabled={removingId === m.user_id}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add member */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Adicionar membro
                    </p>
                    <Input
                      placeholder="Buscar usuário..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="mb-2"
                    />
                    <ScrollArea className="h-36">
                      <div className="space-y-1 pr-2">
                        {availableContacts.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                                <AvatarFallback className="text-[9px]">
                                  {getInitials(c.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{c.full_name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={() => handleAddMember(c.id)}
                              disabled={addingMember}
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {availableContacts.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            {memberSearch
                              ? 'Nenhum usuário encontrado.'
                              : 'Todos os usuários já são membros.'}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
