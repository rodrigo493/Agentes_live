import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Etapas monitoradas por agente
const AGENTE_ETAPAS: Record<string, string[]> = {
  friday: ['Solda', 'Inspeção Solda', 'Lavagem', 'Pintura', 'Inspeção Pintura', 'Montagem'],
  pepper: ['Pedido', 'Engenharia', 'Compras'],
  vision: ['Expedição'],
};

// Nome no banco para cada chave
const AGENTE_NOMES: Record<string, string[]> = {
  friday: ['Friday', 'Agente Friday', 'Agente da Fábrica'],
  pepper: ['Pepper', 'Agente Pepper', 'Agente de Pedidos'],
  vision: ['Vision', 'Agente Vision', 'Agente de Expedição'],
};

interface StepRow {
  id: string;
  status: string;
  due_at: string | null;
  block_reason_text: string | null;
  created_at: string;
  completed_at: string | null;
  workflow_instances: {
    id: string;
    reference: string;
    title: string;
    metadata: Record<string, unknown> | null;
  } | null;
  workflow_template_steps: {
    title: string;
    sla_hours: number;
  } | null;
}

interface AgenteRow {
  id: string;
  nome: string;
  id_da_organizacao: string;
}

async function findAgente(chave: string): Promise<AgenteRow | null> {
  const nomes = AGENTE_NOMES[chave];
  for (const nome of nomes) {
    const { data } = await supabase
      .from('agentes_config')
      .select('id, nome, id_da_organizacao')
      .ilike('nome', `%${nome.split(' ').pop()}%`)
      .limit(1)
      .single<AgenteRow>();
    if (data) return data;
  }
  return null;
}

async function eventoJaExiste(
  workflowStepId: string,
  tipo: string,
  janelaSeg: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - janelaSeg * 1000).toISOString();
  const { count } = await supabase
    .from('eventos_autonomos')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_step_id', workflowStepId)
    .eq('tipo', tipo)
    .gt('criado_em', desde);
  return (count ?? 0) > 0;
}

async function registrarEvento(params: {
  orgId: string;
  agenteId: string | null;
  agenteNome: string;
  tipo: string;
  severidade: string;
  stepId: string;
  workflowRef: string;
  stepTitulo: string;
  titulo: string;
  descricao: string;
  dados: Record<string, unknown>;
}) {
  await supabase.from('eventos_autonomos').insert({
    id_da_organizacao: params.orgId,
    id_do_agente: params.agenteId,
    agente_nome: params.agenteNome,
    tipo: params.tipo,
    severidade: params.severidade,
    workflow_step_id: params.stepId,
    workflow_ref: params.workflowRef,
    step_titulo: params.stepTitulo,
    titulo: params.titulo,
    descricao: params.descricao,
    dados: params.dados,
  });
}

async function monitorarAgente(
  chave: string,
  orgId: string,
  agente: AgenteRow | null,
): Promise<{ eventos: number; erros: string[] }> {
  const etapas = AGENTE_ETAPAS[chave];
  const erros: string[] = [];
  let eventos = 0;

  // Busca steps overdue/blocked nas etapas desse agente
  const { data: steps, error } = await supabase
    .from('workflow_steps')
    .select(`
      id,
      status,
      due_at,
      created_at,
      completed_at,
      block_reason_text,
      workflow_instances!instance_id (
        id,
        reference,
        title,
        metadata
      ),
      workflow_template_steps!template_step_id (
        title,
        sla_hours
      )
    `)
    .in('status', ['overdue', 'blocked'])
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) {
    erros.push(`Erro ao buscar steps: ${error.message}`);
    return { eventos, erros };
  }

  const filtered = (steps as unknown as StepRow[]).filter(
    (s) => etapas.includes(s.workflow_template_steps?.title ?? ''),
  );

  for (const step of filtered) {
    const stepTitulo = step.workflow_template_steps?.title ?? '';
    const workflowRef = step.workflow_instances?.reference ?? step.id;
    const tipo = step.status as 'overdue' | 'blocked';

    // Evita spam: 2h para overdue, 4h para blocked
    const janela = tipo === 'overdue' ? 2 * 3600 : 4 * 3600;
    const jaExiste = await eventoJaExiste(step.id, tipo, janela);
    if (jaExiste) continue;

    const titulo = tipo === 'overdue'
      ? `⚠ ${workflowRef} está atrasado em ${stepTitulo}`
      : `🔒 ${workflowRef} está bloqueado em ${stepTitulo}`;

    const descricao = step.block_reason_text
      ? `Motivo: ${step.block_reason_text}`
      : (tipo === 'overdue' ? `SLA venceu em ${step.due_at}` : 'Etapa bloqueada sem motivo registrado');

    await registrarEvento({
      orgId,
      agenteId: agente?.id ?? null,
      agenteNome: agente?.nome ?? chave,
      tipo,
      severidade: 'critico',
      stepId: step.id,
      workflowRef,
      stepTitulo,
      titulo,
      descricao,
      dados: {
        instance_id: step.workflow_instances?.id,
        instance_title: step.workflow_instances?.title,
        due_at: step.due_at,
        block_reason: step.block_reason_text,
      },
    });
    eventos++;
  }

  // Pepper: novos pedidos (etapa "Pedido" pending criado há < 1h)
  if (chave === 'pepper') {
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: novos } = await supabase
      .from('workflow_steps')
      .select(`
        id,
        status,
        created_at,
        workflow_instances!instance_id (id, reference, title),
        workflow_template_steps!template_step_id (title)
      `)
      .eq('status', 'pending')
      .gt('created_at', umaHoraAtras);

    const novosPedidos = (novos as unknown as StepRow[]).filter(
      (s) => s.workflow_template_steps?.title === 'Pedido',
    );

    for (const s of novosPedidos) {
      const ref = s.workflow_instances?.reference ?? s.id;
      const jaExiste = await eventoJaExiste(s.id, 'novo_pedido', 3600);
      if (jaExiste) continue;

      await registrarEvento({
        orgId,
        agenteId: agente?.id ?? null,
        agenteNome: agente?.nome ?? 'Pepper',
        tipo: 'novo_pedido',
        severidade: 'info',
        stepId: s.id,
        workflowRef: ref,
        stepTitulo: 'Pedido',
        titulo: `📥 Novo pedido: ${ref}`,
        descricao: s.workflow_instances?.title ?? '',
        dados: { instance_id: s.workflow_instances?.id },
      });
      eventos++;
    }
  }

  // Vision: expedições concluídas nos últimos 15min
  if (chave === 'vision') {
    const quinzeMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: expedicoes } = await supabase
      .from('workflow_steps')
      .select(`
        id,
        status,
        completed_at,
        workflow_instances!instance_id (id, reference, title),
        workflow_template_steps!template_step_id (title)
      `)
      .eq('status', 'done')
      .gt('completed_at', quinzeMin);

    const recentes = (expedicoes as unknown as StepRow[]).filter(
      (s) => s.workflow_template_steps?.title === 'Expedição',
    );

    for (const s of recentes) {
      const ref = s.workflow_instances?.reference ?? s.id;
      const jaExiste = await eventoJaExiste(s.id, 'expedicao', 900);
      if (jaExiste) continue;

      await registrarEvento({
        orgId,
        agenteId: agente?.id ?? null,
        agenteNome: agente?.nome ?? 'Vision',
        tipo: 'expedicao',
        severidade: 'info',
        stepId: s.id,
        workflowRef: ref,
        stepTitulo: 'Expedição',
        titulo: `📦 Expedição concluída: ${ref}`,
        descricao: s.workflow_instances?.title ?? '',
        dados: {
          instance_id: s.workflow_instances?.id,
          completed_at: s.completed_at,
        },
      });
      eventos++;
    }
  }

  return { eventos, erros };
}

function isHorarioTrabalho(): boolean {
  const brt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dow = brt.getDay(); // 0=domingo, 6=sábado
  if (dow === 0 || dow === 6) return false;
  const min = brt.getHours() * 60 + brt.getMinutes();
  return min >= 7 * 60 + 30 && min < 17 * 60;
}

Deno.serve(async () => {
  if (!isHorarioTrabalho()) {
    return new Response(
      JSON.stringify({ skipped: true, motivo: 'Fora do horário de operação (seg–sex, 7:30–17:00)' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // Descobre a org da primeira organização cadastrada
    const { data: org } = await supabase
      .from('organizacoes')
      .select('id')
      .limit(1)
      .single<{ id: string }>();

    if (!org) {
      return new Response(JSON.stringify({ error: 'Nenhuma organização encontrada' }), { status: 500 });
    }

    const resultados: Record<string, { eventos: number; erros: string[] }> = {};

    for (const chave of Object.keys(AGENTE_ETAPAS)) {
      const agente = await findAgente(chave);
      resultados[chave] = await monitorarAgente(chave, org.id, agente);
    }

    const totalEventos = Object.values(resultados).reduce((sum, r) => sum + r.eventos, 0);

    return new Response(
      JSON.stringify({ ok: true, totalEventos, resultados }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 },
    );
  }
});
