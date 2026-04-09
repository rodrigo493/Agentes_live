import { redirect } from 'next/navigation';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { SelectSectorForm } from '@/features/auth/components/select-sector-form';

export default async function SelectSectorPage() {
  const supabase = await createClient();

  // Verificar autenticação
  let userId: string | undefined;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) userId = session.user.id;
  }
  if (!userId) redirect('/login');

  const admin = createAdminClient();

  // Buscar setores do usuário
  const { data: userSectors } = await admin
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', userId);

  const sectors = (userSectors ?? [])
    .map((us) => {
      const s = us.sectors as unknown as { id: string; name: string; icon: string | null } | null;
      return s ? { id: s.id, name: s.name, icon: s.icon } : null;
    })
    .filter((s): s is { id: string; name: string; icon: string | null } => s !== null);

  // Sem setores: vai para dashboard
  if (sectors.length === 0) redirect('/dashboard');

  // Só 1 setor: define automaticamente e redireciona
  if (sectors.length === 1) {
    await admin
      .from('profiles')
      .update({ active_sector_id: sectors[0].id })
      .eq('id', userId);
    redirect('/dashboard');
  }

  return <SelectSectorForm sectors={sectors} />;
}
