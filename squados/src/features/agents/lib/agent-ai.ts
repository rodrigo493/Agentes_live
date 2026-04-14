import Anthropic from '@anthropic-ai/sdk';
import { getAgentContext } from './context-policy';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

interface AgentResponse {
  content: string;
  tokensUsed?: number;
  model?: string;
}

/**
 * Gera resposta do agente usando Claude com contexto do setor.
 *
 * Fluxo:
 * 1. Busca o agente no banco (system_prompt, config, context_policy)
 * 2. Busca contexto via getAgentContext (knowledge_memory + processed_memory)
 * 3. Monta o prompt com system + contexto + histórico
 * 4. Chama Claude API
 * 5. Retorna resposta
 */
export async function generateAgentResponse(params: {
  agentId: string;
  sectorId: string;
  userId: string;
  userMessage: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}): Promise<AgentResponse> {
  const admin = createAdminClient();

  // 1. Buscar agente
  const { data: agent } = await admin
    .from('agents')
    .select('*')
    .eq('id', params.agentId)
    .single();

  // Fallback: buscar agente do setor
  let systemPrompt = '';
  let agentConfig: Record<string, any> = {};
  let agentName = 'Agente do Setor';

  if (agent) {
    systemPrompt = agent.system_prompt ?? '';
    agentConfig = (agent.config ?? {}) as Record<string, any>;
    agentName = agent.display_name;
  }

  // 2. Buscar contexto do setor
  let knowledgeContext = '';
  try {
    const context = await getAgentContext({
      agentId: agent?.id ?? '',
      sectorId: params.sectorId,
      userId: params.userId,
      query: params.userMessage,
      limit: 20,
    });

    if (context.data && typeof context.data === 'object' && 'knowledge' in context.data) {
      const { knowledge, processed } = context.data as {
        knowledge: any[];
        processed: any[];
      };

      if (knowledge.length > 0) {
        knowledgeContext += '\n\n## Base de Conhecimento Validado do Setor\n';
        knowledge.forEach((k: any, i: number) => {
          knowledgeContext += `\n### ${i + 1}. ${k.title} [${k.category}] (confiança: ${Math.round(k.confidence_score * 100)}%)\n`;
          knowledgeContext += k.content.substring(0, 2000) + '\n';
          if (k.tags?.length > 0) knowledgeContext += `Tags: ${k.tags.join(', ')}\n`;
        });
      }

      if (Array.isArray(processed) && processed.length > 0) {
        knowledgeContext += '\n\n## Memórias Processadas Recentes\n';
        processed.forEach((p: any, i: number) => {
          knowledgeContext += `\n${i + 1}. [${p.source_type}] ${p.summary ?? p.content.substring(0, 500)}\n`;
        });
      }
    }
  } catch {
    // Se não conseguir buscar contexto, continua sem
  }

  // 3. Buscar documentos recentes do setor para contexto adicional
  const { data: recentDocs } = await admin
    .from('knowledge_docs')
    .select('title, content, doc_type, tags, image_urls')
    .eq('sector_id', params.sectorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentDocs && recentDocs.length > 0) {
    knowledgeContext += '\n\n## Documentos do Setor\n';
    recentDocs.forEach((doc, i) => {
      knowledgeContext += `\n### ${i + 1}. ${doc.title} [${doc.doc_type}]\n`;
      knowledgeContext += (doc.content ?? '').substring(0, 3000) + '\n';
      const urls = (doc as any).image_urls as string[] | undefined;
      if (urls && urls.length > 0) {
        knowledgeContext += `\n**IMAGENS DESTE DOCUMENTO:**\n`;
        urls.forEach((url) => {
          knowledgeContext += `[IMAGE:${url}]\n`;
        });
      }
    });
  }

  // 4. Montar system prompt completo
  const fullSystemPrompt = [
    systemPrompt || `Você é o ${agentName} do SquadOS, um assistente corporativo especializado. Responda de forma clara, objetiva e profissional em português do Brasil.`,
    '\n\n---\n',
    '## REGRAS DE COMPORTAMENTO',
    '- Responda SEMPRE em português do Brasil',
    '- Baseie suas respostas no conhecimento do setor disponível abaixo',
    '- Se não tiver informação suficiente, diga claramente o que não sabe',
    '- Cite fontes quando possível (documentos, procedimentos)',
    '- Seja conciso mas completo',
    '- Formate com markdown quando apropriado',
    '- REGRA OBRIGATÓRIA DE IMAGENS: sempre que sua resposta se basear em um documento que contenha marcadores [IMAGE:url], você DEVE inserir TODOS esses marcadores na sua resposta, exatamente como aparecem no contexto (formato: [IMAGE:https://...]). Faça isso mesmo que o usuário não tenha pedido imagens. As imagens serão renderizadas automaticamente no chat.',
    knowledgeContext
      ? '\n\n---\n## CONTEXTO DO SETOR (use como base para suas respostas)\n' + knowledgeContext
      : '\n\n[Nenhum conhecimento do setor disponível ainda. Responda com base no seu conhecimento geral e sugira que documentos e transcrições sejam importados para melhorar suas respostas.]',
  ].join('\n');

  // 5. Montar mensagens
  const messages: Anthropic.MessageParam[] = [];

  // Histórico (últimas 20 mensagens para não estourar contexto)
  const history = params.conversationHistory.slice(-20);
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Mensagem atual do usuário
  messages.push({
    role: 'user',
    content: params.userMessage,
  });

  // 6. Chamar Claude
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: fullSystemPrompt,
      messages,
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('\n');

    return {
      content: textContent,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
    };
  } catch (error: any) {
    // Se a API key está vazia ou inválida
    if (error?.status === 401 || !process.env.ANTHROPIC_API_KEY) {
      return {
        content: `⚠️ **Chave da API Anthropic não configurada.**\n\nPara ativar o ${agentName}, adicione sua chave em \`.env.local\`:\n\n\`\`\`\nANTHROPIC_API_KEY=sk-ant-...\n\`\`\`\n\nEnquanto isso, o sistema está acumulando conhecimento do setor (${knowledgeContext ? 'já há dados disponíveis' : 'importe transcrições na página de Setores'}).`,
      };
    }

    return {
      content: `Erro ao processar sua mensagem: ${error?.message ?? 'erro desconhecido'}. Tente novamente.`,
    };
  }
}

/**
 * Gera resposta de agente executivo (CEO, Presidente, Conselheiros)
 * com acesso global a todos os setores.
 */
export async function generateExecutiveResponse(params: {
  agentName: string;
  userMessage: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}): Promise<AgentResponse> {
  const admin = createAdminClient();

  // Buscar agente executivo
  const { data: agent } = await admin
    .from('agents')
    .select('*')
    .eq('name', params.agentName)
    .eq('status', 'active')
    .single();

  if (!agent) {
    return { content: 'Agente executivo não encontrado.' };
  }

  // Buscar conhecimento de TODOS os setores (acesso global)
  const { data: allKnowledge } = await admin
    .from('knowledge_memory')
    .select('sector_id, title, content, category, confidence_score, tags')
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(30);

  const { data: allProcessed } = await admin
    .from('processed_memory')
    .select('sector_id, source_type, content, summary, tags, relevance_score')
    .eq('is_active', true)
    .eq('processing_status', 'completed')
    .order('relevance_score', { ascending: false })
    .limit(20);

  // Buscar nomes dos setores
  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name')
    .eq('is_active', true);

  const sectorMap = Object.fromEntries((sectors ?? []).map((s) => [s.id, s.name]));

  let globalContext = '';
  if (allKnowledge && allKnowledge.length > 0) {
    globalContext += '## Conhecimento Validado (todos os setores)\n';
    allKnowledge.forEach((k: any) => {
      globalContext += `\n[${sectorMap[k.sector_id] ?? 'Setor'}] **${k.title}** (${k.category}, ${Math.round(k.confidence_score * 100)}%)\n`;
      globalContext += k.content.substring(0, 1500) + '\n';
    });
  }

  if (allProcessed && allProcessed.length > 0) {
    globalContext += '\n## Memórias Processadas Recentes\n';
    allProcessed.forEach((p: any) => {
      globalContext += `\n[${sectorMap[p.sector_id] ?? 'Setor'}] ${p.summary ?? p.content.substring(0, 500)}\n`;
    });
  }

  const systemPrompt = [
    agent.system_prompt ?? `Você é o ${agent.display_name} do SquadOS.`,
    '\n\n---\n## CONTEXTO GLOBAL DA EMPRESA\n',
    globalContext || '[Nenhum conhecimento acumulado ainda nos setores.]',
  ].join('\n');

  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory.slice(-20).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user' as const, content: params.userMessage },
  ];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('\n');

    return {
      content: textContent,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
    };
  } catch (error: any) {
    if (error?.status === 401 || !process.env.ANTHROPIC_API_KEY) {
      return {
        content: `⚠️ **Chave da API Anthropic não configurada.** Adicione \`ANTHROPIC_API_KEY\` em \`.env.local\`.`,
      };
    }
    return { content: `Erro: ${error?.message ?? 'desconhecido'}` };
  }
}
