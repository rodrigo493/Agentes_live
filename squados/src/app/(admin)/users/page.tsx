import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { UserManagement } from '@/features/users/components/user-management';
import { Users } from 'lucide-react';

export default async function UsersPage() {
  const { profile: currentProfile } = await requirePermission('users', 'manage');

  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email, role, status, phone, sector_id, created_at, sectors!sector_id(name, slug)')
    .is('deleted_at', null)
    .order('full_name');

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
      />
    </div>
  );
}
