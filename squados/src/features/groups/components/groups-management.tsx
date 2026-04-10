'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Pencil, Trash2, Users } from 'lucide-react';
import { EditGroupModal } from '@/features/workspace/components/edit-group-modal';
import { deleteGroupAction } from '@/features/workspace/actions/group-actions';
import type { UserRole } from '@/shared/types/database';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
  member_count: number;
  created_at: string;
  sector_name: string | null;
}

interface Contact {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

interface GroupsManagementProps {
  groups: GroupRow[];
  contacts: Contact[];
  currentUserRole: UserRole;
}

export function GroupsManagement({ groups, contacts, currentUserRole }: GroupsManagementProps) {
  const router = useRouter();
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canManage = currentUserRole === 'admin' || currentUserRole === 'master_admin';

  async function handleDelete(group: GroupRow) {
    if (!confirm(`Desativar o grupo "${group.name}"? O histórico de mensagens será preservado.`)) {
      return;
    }
    setDeleting(group.id);
    setError('');
    const result = await deleteGroupAction(group.id);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setDeleting(null);
  }

  const activeGroups = groups.filter((g) => g.status === 'active');
  const inactiveGroups = groups.filter((g) => g.status !== 'active');

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Grupos Ativos
          </h2>
          <Badge variant="secondary">{activeGroups.length}</Badge>
        </div>

        {activeGroups.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum grupo ativo. Crie grupos a partir do Workspace.
          </Card>
        ) : (
          <div className="grid gap-3">
            {activeGroups.map((group) => (
              <Card key={group.id} className="flex items-center gap-4 p-4">
                <Avatar className="h-12 w-12 flex-shrink-0">
                  {group.avatar_url && <AvatarImage src={group.avatar_url} alt={group.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {group.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{group.name}</p>
                    {group.sector_name && (
                      <Badge variant="outline" className="text-[10px]">
                        {group.sector_name}
                      </Badge>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {group.member_count} membro{group.member_count !== 1 ? 's' : ''}
                    </span>
                    <span>Criado em {new Date(group.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingGroup(group)}
                      title="Editar grupo"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(group)}
                      disabled={deleting === group.id}
                      title="Desativar grupo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {inactiveGroups.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Grupos Inativos
            </h2>
            <Badge variant="outline">{inactiveGroups.length}</Badge>
          </div>
          <div className="grid gap-2">
            {inactiveGroups.map((group) => (
              <Card key={group.id} className="flex items-center gap-3 p-3 opacity-60">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  {group.avatar_url && <AvatarImage src={group.avatar_url} alt={group.name} />}
                  <AvatarFallback className="text-xs">{group.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium truncate">{group.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {group.member_count} membro{group.member_count !== 1 ? 's' : ''} · {group.status}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {editingGroup && (
        <EditGroupModal
          open={true}
          onClose={() => setEditingGroup(null)}
          group={{
            id: editingGroup.id,
            name: editingGroup.name,
            description: editingGroup.description,
            status: editingGroup.status,
            avatar_url: editingGroup.avatar_url,
          }}
          contacts={contacts}
          onGroupUpdated={() => {
            setEditingGroup(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
