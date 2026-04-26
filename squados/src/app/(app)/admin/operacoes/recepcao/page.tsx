import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { RecepcaoKanban } from '@/features/recepcao/components/recepcao-kanban';

export default async function RecepcaoMercadoriasPage() {
  const { profile } = await getAuthenticatedUser();

  const isAllowed =
    profile.role === 'admin' ||
    profile.role === 'master_admin' ||
    profile.role === 'operator';

  if (!isAllowed) redirect('/dashboard');

  const admin = createAdminClient();

  const { data: org } = await admin
    .from('organizacoes')
    .select('id')
    .limit(1)
    .single();

  const { data } = org
    ? await admin
        .from('recepcao_mercadorias')
        .select('*')
        .eq('id_da_organizacao', org.id)
        .not('etapa', 'in', '(concluido,cancelado)')
        .order('criado_em', { ascending: false })
        .limit(100)
    : { data: [] };

  return (
    <div className="h-full flex flex-col">
      <RecepcaoKanban initialData={data ?? []} />
    </div>
  );
}
