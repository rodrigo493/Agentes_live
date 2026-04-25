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

  // Primeiro busca a missão com workflows para obter o workflow ID
  const missaoResult = await admin
    .from('missoes')
    .select(`id, titulo, descricao, status, workflows (id, conteudo, status)`)
    .eq('id', id)
    .single();

  if (missaoResult.error || !missaoResult.data) notFound();

  const workflowId = missaoResult.data.workflows?.[0]?.id ?? null;

  // tarefas têm FK para workflow (não para missao diretamente)
  const [tarefasResult, agentesResult] = await Promise.all([
    workflowId
      ? admin
          .from('tarefas')
          .select(`
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
          `)
          .eq('id_do_workflow', workflowId)
          .order('criado_em', { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    admin.from('agentes_config').select('id, nome, papel').order('nome'),
  ]);

  const raw = missaoResult.data;

  const missao = {
    ...raw,
    tarefas: ((tarefasResult.data ?? []) as Record<string, unknown>[]).map((t) => ({
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
