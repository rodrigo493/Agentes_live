import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { GroupsManagement } from '@/features/groups/components/groups-management';
import { UsersRound } from 'lucide-react';

export default async function GroupsAdminPage() {
  const { profile } = await requirePermission('groups', 'manage');
  const admin = createAdminClient();

  // Busca todos os grupos com setor
  const { data: rawGroups } = await admin
    .from('groups')
    .select('id, name, description, status, avatar_url, created_at, sector_id')
    .order('created_at', { ascending: false });

  // Contagem de membros por grupo
  const groupIds = (rawGroups ?? []).map((g) => g.id);
  const { data: membersRows } =
    groupIds.length > 0
      ? await admin.from('group_members').select('group_id').in('group_id', groupIds)
      : { data: [] as { group_id: string }[] };

  const memberCountMap: Record<string, number> = {};
  for (const row of membersRows ?? []) {
    memberCountMap[row.group_id] = (memberCountMap[row.group_id] ?? 0) + 1;
  }

  // Nomes dos setores
  const sectorIds = Array.from(
    new Set((rawGroups ?? []).map((g) => g.sector_id).filter(Boolean) as string[])
  );
  const { data: sectorsData } =
    sectorIds.length > 0
      ? await admin.from('sectors').select('id, name').in('id', sectorIds)
      : { data: [] as { id: string; name: string }[] };

  const sectorNameMap: Record<string, string> = {};
  for (const s of sectorsData ?? []) {
    sectorNameMap[s.id] = s.name;
  }

  const groups = (rawGroups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    avatar_url: g.avatar_url,
    created_at: g.created_at,
    member_count: memberCountMap[g.id] ?? 0,
    sector_name: g.sector_id ? (sectorNameMap[g.sector_id] ?? null) : null,
  }));

  // Contatos para o modal de edição (adicionar/remover membros)
  const { data: contactsData } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name');

  const contacts = (contactsData ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    avatar_url: c.avatar_url,
    role: c.role,
  }));

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersRound className="w-6 h-6 text-primary" />
          Gestão de Grupos
        </h1>
        <p className="text-sm text-muted-foreground">
          Editar grupos, gerenciar membros e desativar grupos encerrados
        </p>
      </div>

      <GroupsManagement
        groups={groups}
        contacts={contacts}
        currentUserRole={profile.role}
      />
    </div>
  );
}
