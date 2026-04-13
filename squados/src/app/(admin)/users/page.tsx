import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { UserManagement } from '@/features/users/components/user-management';
import { Users } from 'lucide-react';

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
