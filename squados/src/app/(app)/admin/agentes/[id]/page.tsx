import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AgentProfileShell } from '@/features/agentes/components/agent-profile-shell';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('agentes_config').select('nome').eq('id', id).single();
  return { title: data ? `${data.nome} — Squad OS` : 'Agente — Squad OS' };
}

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const [agenteResult, countResult] = await Promise.all([
    admin.from('agentes_config').select('*').eq('id', id).single(),
    admin.from('tarefas').select('status').eq('id_do_responsavel', id),
  ]);

  if (agenteResult.error || !agenteResult.data) notFound();

  const tasks = countResult.data ?? [];
  const ativas = tasks.filter((t) => t.status !== 'Concluída').length;
  const concluidas = tasks.filter((t) => t.status === 'Concluída').length;

  const agente = {
    ...agenteResult.data,
    heartbeat_ativo: agenteResult.data.heartbeat_ativo ?? true,
    modelo: agenteResult.data.modelo ?? 'claude-sonnet-4-6',
    tarefas_ativas: ativas,
    tarefas_concluidas: concluidas,
  };

  return <AgentProfileShell agente={agente as any} />;
}
