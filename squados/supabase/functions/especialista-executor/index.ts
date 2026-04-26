import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface TarefaRow {
  id: string;
  titulo: string;
  descricao: string | null;
  id_da_organizacao: string;
  id_do_responsavel: string;
  id_do_workflow: string;
  agentes_config: {
    id: string;
    nome: string;
    soul_prompt: string;
  };
}

interface WorkflowRow {
  id: string;
  conteudo: string;
  contexto_adicional: string | null;
}

interface EntregavelAnterior {
  titulo: string;
  conteudo: string;
  agente: string;
}

async function buildPromptContext(tarefa: TarefaRow): Promise<string> {
  // Busca o workflow para obter conteudo e contexto_adicional
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, conteudo, contexto_adicional')
    .eq('id', tarefa.id_do_workflow)
    .single<WorkflowRow>();

  // Busca tarefas concluídas anteriores do mesmo workflow com seus entregaveis
  const { data: tarefasAnteriores } = await supabase
    .from('tarefas')
    .select(`
      titulo,
      entregaveis!id_do_entregavel (
        conteudo
      ),
      agentes_config!id_do_responsavel (
        nome
      )
    `)
    .eq('id_do_workflow', tarefa.id_do_workflow)
    .eq('status', 'Concluída')
    .neq('id', tarefa.id)
    .order('criado_em', { ascending: true });

  const entregaveisAnteriores: EntregavelAnterior[] = (tarefasAnteriores ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((t: any) => t.entregaveis?.conteudo)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => ({
      titulo: t.titulo as string,
      conteudo: t.entregaveis.conteudo as string,
      agente: (t.agentes_config as { nome: string } | null)?.nome ?? 'Agente',
    }));

  const partes: string[] = [];

  // Plano da Orquestradora (sempre inclui)
  if (workflow?.conteudo) {
    partes.push(`# PLANO DO WORKFLOW\n${workflow.conteudo}`);
  }

  // Contexto / respostas do Rodrigo (inclui se preenchido)
  if (workflow?.contexto_adicional?.trim()) {
    partes.push(`# RESPOSTAS E CLARIFICAÇÕES DO RODRIGO\n${workflow.contexto_adicional.trim()}`);
  }

  // Entregáveis anteriores (inclui se existirem)
  if (entregaveisAnteriores.length > 0) {
    const blocos = entregaveisAnteriores.map(
      (e) => `### ${e.titulo} (executado por: ${e.agente})\n${e.conteudo}`,
    );
    partes.push(`# TRABALHO JÁ REALIZADO PELAS FASES ANTERIORES\n${blocos.join('\n\n---\n\n')}`);
  }

  // Tarefa atual (sempre ao final)
  partes.push(
    `# SUA TAREFA ATUAL\n**${tarefa.titulo}**\n\n${tarefa.descricao ?? 'Execute a tarefa conforme descrita no título.'}`,
  );

  return partes.join('\n\n---\n\n');
}

async function executarTarefa(tarefa: TarefaRow): Promise<void> {
  const { agentes_config: agente } = tarefa;

  // Marca como Em Andamento antes de chamar a IA
  await supabase
    .from('tarefas')
    .update({ status: 'Em Andamento' })
    .eq('id', tarefa.id);

  const promptCompleto = await buildPromptContext(tarefa);

  const stream = await anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: agente.soul_prompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: promptCompleto,
      },
    ],
  });

  const response = await stream.finalMessage();

  const conteudo = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('\n');

  // Salva o entregável
  const { data: entregavel, error: entregavelError } = await supabase
    .from('entregaveis')
    .insert({
      id_da_organizacao: tarefa.id_da_organizacao,
      id_da_tarefa: tarefa.id,
      id_do_agente_executor: agente.id,
      conteudo,
      formato: 'markdown',
    })
    .select('id')
    .single();

  if (entregavelError) throw new Error(`Erro ao salvar entregável: ${entregavelError.message}`);

  // Marca a tarefa como Concluída e registra o entregável
  await supabase
    .from('tarefas')
    .update({
      status: 'Concluída',
      id_do_entregavel: entregavel.id,
    })
    .eq('id', tarefa.id);
}

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('WORKFLOW_API_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Busca tarefas Pendentes que tenham responsável definido
  const { data: tarefas, error } = await supabase
    .from('tarefas')
    .select(`
      id,
      titulo,
      descricao,
      depende_de,
      id_da_organizacao,
      id_do_responsavel,
      id_do_workflow,
      agentes_config!id_do_responsavel (
        id,
        nome,
        soul_prompt
      )
    `)
    .eq('status', 'Pendente')
    .not('id_do_responsavel', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!tarefas || tarefas.length === 0) {
    return new Response(
      JSON.stringify({ message: 'Nenhuma tarefa pendente com responsável', executadas: 0 }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Filtra tarefas cujas dependências já estão Concluídas
  const tarefasProntas: TarefaRow[] = [];

  for (const tarefa of tarefas as TarefaRow[]) {
    if (!tarefa.depende_de || (tarefa.depende_de as string[]).length === 0) {
      tarefasProntas.push(tarefa);
      continue;
    }

    const { count } = await supabase
      .from('tarefas')
      .select('id', { count: 'exact', head: true })
      .in('id', tarefa.depende_de as string[])
      .neq('status', 'Concluída');

    if ((count ?? 0) === 0) tarefasProntas.push(tarefa);
  }

  const resultados: { id: string; titulo: string; status: 'ok' | 'erro'; erro?: string }[] = [];

  for (const tarefa of tarefasProntas) {
    try {
      await executarTarefa(tarefa);
      resultados.push({ id: tarefa.id, titulo: tarefa.titulo, status: 'ok' });
    } catch (err) {
      // Reverte para Pendente em caso de erro
      await supabase.from('tarefas').update({ status: 'Pendente' }).eq('id', tarefa.id);
      resultados.push({
        id: tarefa.id,
        titulo: tarefa.titulo,
        status: 'erro',
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({
      executadas: resultados.filter((r) => r.status === 'ok').length,
      bloqueadas: tarefas.length - tarefasProntas.length,
      resultados,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
