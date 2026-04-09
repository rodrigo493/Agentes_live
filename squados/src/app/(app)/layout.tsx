import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AppShell } from '@/shared/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Buscar setores disponíveis para o usuário
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

  // Se tem 2+ setores e nenhum ativo, força seleção
  if (userSectors.length >= 2 && !profile.active_sector_id) {
    redirect('/select-sector');
  }

  // Se tem 1 setor e nenhum ativo, auto-seleciona
  if (userSectors.length === 1 && !profile.active_sector_id) {
    await admin
      .from('profiles')
      .update({ active_sector_id: userSectors[0].id })
      .eq('id', user.id);
  }

  // Setor ativo
  const activeSector = userSectors.find((s) => s.id === profile.active_sector_id) ?? null;

  return (
    <AppShell
      profile={profile}
      userSectors={userSectors}
      activeSector={activeSector}
    >
      {children}
    </AppShell>
  );
}
