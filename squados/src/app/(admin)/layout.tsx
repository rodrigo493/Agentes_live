import { requireRole } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AppShell } from '@/shared/components/layout/app-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireRole('admin');
  const admin = createAdminClient();

  const { data: userSectorsData } = await admin
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', user.id);

  const userSectors = (userSectorsData ?? [])
    .map((us) => {
      const s = us.sectors as unknown as { id: string; name: string; icon: string | null } | null;
      return s ? { id: s.id, name: s.name, icon: s.icon } : null;
    })
    .filter((s): s is { id: string; name: string; icon: string | null } => s !== null);

  const activeSector = userSectors.find((s) => s.id === profile.active_sector_id) ?? null;

  return (
    <AppShell profile={profile} userSectors={userSectors} activeSector={activeSector}>
      {children}
    </AppShell>
  );
}
