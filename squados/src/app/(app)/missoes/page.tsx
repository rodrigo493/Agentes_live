import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { MissoesShell } from '@/features/missoes/components/missoes-shell';

export const metadata = { title: 'Missões' };

export default async function MissoesPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin) redirect('/dashboard');

  const admin = createAdminClient();

  const { data } = await admin
    .from('missoes')
    .select(`
      id,
      titulo,
      descricao,
      status,
      workflows (
        id,
        conteudo,
        status,
        criado_em
      )
    `)
    .order('criado_em', { ascending: false });

  return <MissoesShell missoes={data ?? []} />;
}
