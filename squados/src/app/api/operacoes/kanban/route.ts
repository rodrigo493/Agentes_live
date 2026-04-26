import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

// Etapas monitoradas por cada agente
const AGENTE_ETAPAS: Record<string, string[]> = {
  friday: ['Solda', 'Inspeção Solda', 'Lavagem', 'Pintura', 'Inspeção Pintura', 'Montagem'],
  pepper: ['Pedido', 'Engenharia', 'Compras'],
  vision: ['Expedição'],
};

export async function GET(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const agenteFiltro = req.nextUrl.searchParams.get('agente')?.toLowerCase() ?? null;
  const statusFiltro = req.nextUrl.searchParams.get('status') ?? null;

  const admin = createAdminClient();

  // Busca todos os steps ativos com seus template steps e instâncias
  const statusQuery = statusFiltro
    ? [statusFiltro]
    : ['pending', 'in_progress', 'overdue', 'blocked'];

  const { data: steps, error } = await admin
    .from('workflow_steps')
    .select(`
      id,
      step_order,
      status,
      due_at,
      created_at,
      updated_at,
      completed_at,
      block_reason_text,
      payload_data,
      workflow_instances!instance_id (
        id,
        reference,
        title,
        metadata,
        started_at
      ),
      workflow_template_steps!template_step_id (
        id,
        title,
        sla_hours
      )
    `)
    .in('status', statusQuery)
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (steps ?? []).map((s: any) => ({
    id: s.id,
    step_order: s.step_order,
    status: s.status,
    due_at: s.due_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
    completed_at: s.completed_at,
    block_reason: s.block_reason_text,
    step_titulo: s.workflow_template_steps?.title ?? '',
    sla_hours: s.workflow_template_steps?.sla_hours ?? 24,
    instance: {
      id: s.workflow_instances?.id,
      reference: s.workflow_instances?.reference,
      title: s.workflow_instances?.title,
      metadata: s.workflow_instances?.metadata,
    },
  }));

  // Se solicitou agente específico, retorna apenas as etapas desse agente
  if (agenteFiltro && AGENTE_ETAPAS[agenteFiltro]) {
    const etapas = AGENTE_ETAPAS[agenteFiltro];
    const filtered = all.filter((s) => etapas.includes(s.step_titulo));
    return NextResponse.json({ steps: filtered, agente: agenteFiltro });
  }

  // Retorna agrupado por agente
  const friday = all.filter((s) => AGENTE_ETAPAS.friday.includes(s.step_titulo));
  const pepper  = all.filter((s) => AGENTE_ETAPAS.pepper.includes(s.step_titulo));
  const vision  = all.filter((s) => AGENTE_ETAPAS.vision.includes(s.step_titulo));

  // Pedidos novos: Pedido pending criado na última 1h
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const pepperNovos = pepper.filter(
    (s) => s.step_titulo === 'Pedido' && s.status === 'pending' && s.created_at > umaHoraAtras
  );

  // Expedições recentes: done nos últimos 15min
  const quinzeMinAtras = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const visionRecentes = vision.filter(
    (s) => s.status === 'done' && s.completed_at && s.completed_at > quinzeMinAtras
  );

  return NextResponse.json({
    friday: {
      overdue_blocked: friday.filter((s) => s.status === 'overdue' || s.status === 'blocked'),
      em_andamento: friday.filter((s) => s.status === 'in_progress' || s.status === 'pending'),
    },
    pepper: {
      novos_pedidos: pepperNovos,
      todos: pepper,
    },
    vision: {
      expedicoes_recentes: visionRecentes,
      todos: vision,
    },
    totais: {
      overdue: all.filter((s) => s.status === 'overdue').length,
      blocked: all.filter((s) => s.status === 'blocked').length,
      pendentes: all.filter((s) => s.status === 'pending').length,
      em_andamento: all.filter((s) => s.status === 'in_progress').length,
    },
  });
}
