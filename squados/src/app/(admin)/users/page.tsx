import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { UserManagement } from '@/features/users/components/user-management';
import { Users, AlertTriangle } from 'lucide-react';

export default async function UsersPage() {
  const { profile: currentProfile } = await requirePermission('users', 'manage');

  const admin = createAdminClient();

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, full_name, email, role, status, phone, sector_id, avatar_url, allowed_nav_items, created_at')
    .is('deleted_at', null)
    .order('full_name');

  if (profilesError) {
    console.error('[UsersPage] profiles query error:', profilesError);
  }

  const profilesEmptyButQueryOk = !profilesError && (profiles?.length ?? 0) === 0;

  const { data: sectors } = await admin
    .from('sectors')
    .select('*')
    .eq('is_active', true)
    .order('name');

  const { data: allSectorsData } = await admin
    .from('sectors')
    .select('id, name, icon')
    .eq('is_active', true)
    .order('name');
  const allSectors = allSectorsData ?? [];

  // Fetch multi-sector assignments for all users in the listing
  const userIds = (profiles ?? []).map((p) => p.id);
  const { data: userSectorsRows } =
    userIds.length > 0
      ? await admin
          .from('user_sectors')
          .select('user_id, sectors(id, name)')
          .in('user_id', userIds)
      : { data: [] as Array<{ user_id: string; sectors: { id: string; name: string } | null }> };

  const userSectorsMap: Record<string, { id: string; name: string }[]> = {};
  for (const row of userSectorsRows ?? []) {
    const s = row.sectors as unknown as { id: string; name: string } | null;
    if (!s) continue;
    if (!userSectorsMap[row.user_id]) userSectorsMap[row.user_id] = [];
    userSectorsMap[row.user_id].push({ id: s.id, name: s.name });
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Gestão de Usuários
        </h1>
        <p className="text-sm text-muted-foreground">
          Gerenciar usuários, perfis e permissões
        </p>
      </div>

      {profilesError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Erro ao carregar usuários do banco</p>
            <p className="text-xs">
              A lista abaixo não reflete o estado real. Mensagem: <code className="font-mono">{profilesError.message}</code>
              {profilesError.code ? <> · code <code className="font-mono">{profilesError.code}</code></> : null}
            </p>
          </div>
        </div>
      )}

      {profilesEmptyButQueryOk && (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Nenhum usuário ativo encontrado</p>
            <p className="text-xs">
              A query retornou 0 registros em <code className="font-mono">profiles</code> com <code className="font-mono">deleted_at IS NULL</code>. Verifique no Supabase se os usuários existem ou se foram marcados como deletados.
            </p>
          </div>
        </div>
      )}

      <UserManagement
        users={profiles ?? []}
        sectors={sectors ?? []}
        currentUserRole={currentProfile.role}
        allSectors={allSectors}
        userSectorsMap={userSectorsMap}
      />
    </div>
  );
}
