import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface Missao {
  id: string;
  titulo: string;
  descricao: string;
  agentes_config: {
    id: string;
    nome: string;
    soul_prompt: string;
  };
}

async function planejarMissao(missao: Missao): Promise<void> {
  const { id, titulo, descricao, agentes_config: agente } = missao;

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
        content: `# Nova Missão: ${titulo}\n\n${descricao}\n\nDesenhe o Workflow completo para esta missão. Inclua fases, papéis, entregáveis e checkpoints de aprovação.`,
      },
    ],
  });

  const response = await stream.finalMessage();

  const conteudo = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('\n');

  const { error: insertError } = await supabase.from('workflows').insert({
    id_da_missao: id,
    id_do_agente_criador: agente.id,
    conteudo,
    status: 'Aguardando Aprovação',
  });

  if (insertError) throw new Error(`Erro ao salvar workflow: ${insertError.message}`);

  const { error: updateError } = await supabase
    .from('missoes')
    .update({ status: 'Em Execução' })
    .eq('id', id);

  if (updateError) throw new Error(`Erro ao atualizar missão: ${updateError.message}`);
}

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('WORKFLOW_API_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: missoes, error } = await supabase
    .from('missoes')
    .select(`
      id,
      titulo,
      descricao,
      agentes_config!id_do_responsavel (
        id,
        nome,
        soul_prompt
      )
    `)
    .eq('status', 'Planejamento');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!missoes || missoes.length === 0) {
    return new Response(JSON.stringify({ message: 'Nenhuma missão pendente', planejadas: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resultados: { id: string; titulo: string; status: 'ok' | 'erro'; erro?: string }[] = [];

  for (const missao of missoes as Missao[]) {
    try {
      await planejarMissao(missao);
      resultados.push({ id: missao.id, titulo: missao.titulo, status: 'ok' });
    } catch (err) {
      resultados.push({
        id: missao.id,
        titulo: missao.titulo,
        status: 'erro',
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({ planejadas: resultados.filter((r) => r.status === 'ok').length, resultados }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
