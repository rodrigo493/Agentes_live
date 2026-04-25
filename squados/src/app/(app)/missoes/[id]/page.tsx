import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { MissaoDetalheShell } from '@/features/missoes/components/missao-detalhe-shell';

export const metadata = { title: 'Detalhe da Missão' };

export default async function MissaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin) redirect('/dashboard');

  const admin = createAdminClient();

  const [missaoResult, agentesResult] = await Promise.all([
    admin
      .from('missoes')
      .select(`
        id,
        titulo,
        descricao,
        status,
        workflows (
          id,
          conteudo,
          status
        ),
        tarefas (
          id,
          titulo,
          descricao,
          status,
          depende_de,
          id_do_responsavel,
          entregaveis!id_do_entregavel (
            id,
            conteudo,
            formato,
            criado_em
          )
        )
      `)
      .eq('id', id)
      .order('criado_em', { referencedTable: 'tarefas', ascending: true })
      .single(),
    admin
      .from('agentes_config')
      .select('id, nome, papel')
      .order('nome'),
  ]);

  if (missaoResult.error || !missaoResult.data) notFound();

  const raw = missaoResult.data;

  // Supabase retorna joins como array; normaliza entregaveis para objeto ou null
  const missao = {
    ...raw,
    tarefas: (raw.tarefas ?? []).map((t) => ({
      ...t,
      entregaveis: Array.isArray(t.entregaveis) ? (t.entregaveis[0] ?? null) : t.entregaveis,
    })),
  };

  return (
    <MissaoDetalheShell
      missao={missao}
      agentes={agentesResult.data ?? []}
    />
  );
}
