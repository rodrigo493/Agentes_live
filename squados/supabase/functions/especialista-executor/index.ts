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
  agentes_config: {
    id: string;
    nome: string;
    soul_prompt: string;
  };
}

async function executarTarefa(tarefa: TarefaRow): Promise<void> {
  const { agentes_config: agente } = tarefa;

  // Marca como Em Andamento antes de chamar a IA
  await supabase
    .from('tarefas')
    .update({ status: 'Em Andamento' })
    .eq('id', tarefa.id);

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
        content: `# Tarefa: ${tarefa.titulo}\n\n${tarefa.descricao ?? 'Execute a tarefa conforme descrita no título.'}`,
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
  // e cujas dependências estejam todas Concluídas
  const { data: tarefas, error } = await supabase
    .from('tarefas')
    .select(`
      id,
      titulo,
      descricao,
      depende_de,
      id_da_organizacao,
      id_do_responsavel,
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
