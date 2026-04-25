import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface TarefaExtraida {
  titulo: string;
  descricao: string;
  depende_de_indices: number[];
}

interface WorkflowRow {
  id: string;
  conteudo: string;
  id_da_missao: string;
  missoes: {
    id_da_organizacao: string;
    id_do_responsavel: string;
  };
}

async function extrairTarefas(conteudo: string): Promise<TarefaExtraida[]> {
  const prompt = `Você é um parser de workflows. Analise o workflow abaixo e extraia todas as tarefas individuais.

Retorne APENAS um JSON válido com este formato exato (sem markdown, sem explicação):
{
  "tarefas": [
    {
      "titulo": "título curto da tarefa",
      "descricao": "instruções detalhadas para o agente executar esta tarefa",
      "depende_de_indices": []
    }
  ]
}

O campo "depende_de_indices" deve conter os índices (base 0) das tarefas que precisam ser concluídas antes desta.

WORKFLOW:
${conteudo}`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('');

  const parsed = JSON.parse(text);
  return parsed.tarefas as TarefaExtraida[];
}

async function executarWorkflow(workflow: WorkflowRow): Promise<void> {
  const tarefasExtraidas = await extrairTarefas(workflow.conteudo);

  if (tarefasExtraidas.length === 0) return;

  // Inserir tarefas sem dependências primeiro para obter os IDs
  const inseridos: string[] = [];

  for (const tarefa of tarefasExtraidas) {
    const dependeDeIds = tarefa.depende_de_indices
      .filter((i) => i < inseridos.length)
      .map((i) => inseridos[i]);

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        id_da_organizacao: workflow.missoes.id_da_organizacao,
        id_do_workflow: workflow.id,
        titulo: tarefa.titulo,
        descricao: tarefa.descricao,
        depende_de: dependeDeIds,
        id_do_responsavel: workflow.missoes.id_do_responsavel,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Erro ao inserir tarefa "${tarefa.titulo}": ${error.message}`);
    inseridos.push(data.id);
  }
}

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('WORKFLOW_API_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Aceita um workflow_id específico no body, ou processa todos os Aprovados sem tarefas
  const body = await req.json().catch(() => ({}));
  const workflowId: string | undefined = body.workflow_id;

  let query = supabase
    .from('workflows')
    .select(`
      id,
      conteudo,
      id_da_missao,
      missoes!id_da_missao (
        id_da_organizacao,
        id_do_responsavel
      )
    `)
    .eq('status', 'Aprovado');

  if (workflowId) {
    query = query.eq('id', workflowId);
  }

  const { data: workflows, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!workflows || workflows.length === 0) {
    return new Response(
      JSON.stringify({ message: 'Nenhum workflow aprovado para processar', processados: 0 }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const resultados: { id: string; status: 'ok' | 'erro'; erro?: string }[] = [];

  for (const workflow of workflows as WorkflowRow[]) {
    // Pular workflows que já têm tarefas
    const { count } = await supabase
      .from('tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('id_do_workflow', workflow.id);

    if ((count ?? 0) > 0) continue;

    try {
      await executarWorkflow(workflow);
      resultados.push({ id: workflow.id, status: 'ok' });
    } catch (err) {
      resultados.push({
        id: workflow.id,
        status: 'erro',
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({
      processados: resultados.filter((r) => r.status === 'ok').length,
      resultados,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
