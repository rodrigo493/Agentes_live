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

  // 3. Buscar documentos do setor — todos os que têm imagens + recentes
  const { data: allDocs } = await admin
    .from('knowledge_docs')
    .select('title, content, doc_type, tags, image_urls, image_captions')
    .eq('sector_id', params.sectorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50);

  // Matching por palavras-chave da pergunta contra título/tags/conteúdo
  const tokens = params.userMessage
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  const normalize = (s: string) =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const scoreDoc = (d: any) => {
    const hay = normalize(`${d.title} ${(d.tags ?? []).join(' ')} ${(d.content ?? '').slice(0, 500)}`);
    let score = 0;
    for (const t of tokens) {
      if (normalize(d.title).includes(t)) score += 3;
      if (hay.includes(t)) score += 1;
    }
    return score;
  };

  const ranked = (allDocs ?? [])
    .map((d) => ({ d, score: scoreDoc(d) }))
    .sort((a, b) => b.score - a.score);

  const matched = ranked.filter((r) => r.score > 0).map((r) => r.d);
  const topByRecent = (allDocs ?? []).slice(0, 5);
  const withImages = (allDocs ?? []).filter((d) => {
    const urls = (d as any).image_urls as string[] | undefined;
    return urls && urls.length > 0;
  });

  // Dedup preservando prioridade: matched > recentes > com imagens
  const seen = new Set<string>();
  const docsToInclude: any[] = [];
  for (const d of [...matched, ...topByRecent, ...withImages]) {
    const key = d.title;
    if (seen.has(key)) continue;
    seen.add(key);
    docsToInclude.push(d);
  }

  if (matched.length > 0) {
    knowledgeContext += '\n\n## DOCUMENTOS QUE COINCIDEM COM A PERGUNTA\n';
    knowledgeContext += `Foram encontrados ${matched.length} documento(s) com palavras-chave da pergunta. Use-os como fonte principal.\n`;
    matched.forEach((d, i) => {
      knowledgeContext += `${i + 1}. "${d.title}" [${d.doc_type}]\n`;
    });
  }

  if (docsToInclude.length > 0) {
    knowledgeContext += '\n\n## Documentos do Setor\n';
    docsToInclude.forEach((doc, i) => {
      knowledgeContext += `\n### ${i + 1}. ${doc.title} [${doc.doc_type}]\n`;
      knowledgeContext += (doc.content ?? '').substring(0, 3000) + '\n';
      const urls = (doc as any).image_urls as string[] | undefined;
      const caps = (doc as any).image_captions as string[] | undefined;
      if (urls && urls.length > 0) {
        knowledgeContext += `\n**IMAGENS DESTE DOCUMENTO (inserir TODAS na resposta quando citar este documento):**\n`;
        urls.forEach((url, ui) => {
          const cap = caps?.[ui]?.trim();
          if (cap) knowledgeContext += `Descrição: ${cap}\n`;
          knowledgeContext += `[IMAGE:${url}]\n`;
        });
      }
    });
  }

  // 3b. Galeria global — garante que todas as imagens do setor fiquem visíveis ao agente
  const allImages: { title: string; url: string; caption: string }[] = [];
  (allDocs ?? []).forEach((d) => {
    const urls = (d as any).image_urls as string[] | undefined;
    const caps = (d as any).image_captions as string[] | undefined;
    if (urls && urls.length > 0) {
      urls.forEach((url, ui) =>
        allImages.push({ title: d.title, url, caption: caps?.[ui]?.trim() ?? '' })
      );
    }
  });

  // 3c. Roteiros de montagem (assembly_procedures) — inclui texto + imagens/PDFs
  const { data: procedures } = await admin
    .from('assembly_procedures')
    .select('id, title, description, procedure_text, tags, assembly_procedure_media(type, url, caption, order_index)')
    .eq('sector_id', params.sectorId)
    .eq('is_active', true)
    .limit(50);

  if (procedures && procedures.length > 0) {
    const scoreProc = (p: any) => {
      const hay = normalize(`${p.title} ${p.description ?? ''} ${(p.tags ?? []).join(' ')} ${(p.procedure_text ?? '').slice(0, 500)}`);
      let s = 0;
      for (const t of tokens) {
        if (normalize(p.title).includes(t)) s += 3;
        if (hay.includes(t)) s += 1;
      }
      return s;
    };
    const rankedProcs = procedures.map((p: any) => ({ p, s: scoreProc(p) })).sort((a, b) => b.s - a.s);
    const matchedProcs = rankedProcs.filter((r) => r.s > 0).map((r) => r.p);
    const procsToShow = matchedProcs.length > 0 ? matchedProcs : procedures.slice(0, 5);

    if (matchedProcs.length > 0) {
      knowledgeContext += '\n\n## ROTEIROS DE MONTAGEM QUE COINCIDEM COM A PERGUNTA\n';
      matchedProcs.forEach((p: any, i: number) => {
        knowledgeContext += `${i + 1}. "${p.title}"\n`;
      });
    }

    knowledgeContext += '\n\n## Roteiros de Montagem do Setor\n';
    procsToShow.forEach((p: any, i: number) => {
      knowledgeContext += `\n### ${i + 1}. ${p.title}\n`;
      if (p.description) knowledgeContext += `${p.description}\n`;
      if (p.procedure_text) knowledgeContext += `\n${(p.procedure_text as string).substring(0, 4000)}\n`;
      const media = ((p.assembly_procedure_media ?? []) as any[]).sort((a, b) => a.order_index - b.order_index);
      const imgs = media.filter((m) => m.type === 'image');
      const pdfs = media.filter((m) => m.type === 'pdf');
      if (imgs.length > 0) {
        knowledgeContext += `\n**IMAGENS DESTE ROTEIRO (inserir TODAS quando citar este roteiro):**\n`;
        imgs.forEach((m) => {
          if (m.caption) knowledgeContext += `Descrição: ${m.caption}\n`;
          knowledgeContext += `[IMAGE:${m.url}]\n`;
        });
      }
      if (pdfs.length > 0) {
        knowledgeContext += `\n**PDFs anexados:** ${pdfs.map((m) => m.url).join(', ')}\n`;
      }
    });

    // Adiciona imagens dos roteiros à galeria global
    procedures.forEach((p: any) => {
      ((p.assembly_procedure_media ?? []) as any[])
        .filter((m) => m.type === 'image')
        .forEach((m) => {
          allImages.push({ title: `Roteiro: ${p.title}`, url: m.url, caption: m.caption ?? '' });
        });
    });
  }

  if (allImages.length > 0) {
    knowledgeContext += '\n\n## GALERIA DE IMAGENS DISPONÍVEIS NO SETOR\n';
    knowledgeContext += 'Existem imagens anexadas ao conhecimento. Use as descrições abaixo para decidir qual imagem é relevante à pergunta do usuário e insira o marcador [IMAGE:url] correspondente na resposta. NUNCA diga que não há imagens quando esta lista não estiver vazia.\n\n';
    allImages.forEach((img) => {
      const desc = img.caption ? ` — ${img.caption}` : '';
      knowledgeContext += `- Documento "${img.title}"${desc}: [IMAGE:${img.url}]\n`;
    });
  }

  // 4. Montar system prompt completo
  const fullSystemPrompt = [
    systemPrompt || `Você é o ${agentName} do SquadOS, um assistente corporativo especializado. Responda de forma clara, objetiva e profissional em português do Brasil.`,
    '\n\n---\n',
    '## REGRAS DE COMPORTAMENTO',
    '- Responda SEMPRE em português do Brasil',
    '- FIDELIDADE ABSOLUTA AO CONHECIMENTO: responda APENAS com base no conteúdo que aparece no "CONTEXTO DO SETOR" abaixo. Não adicione informações, etapas, parâmetros, tolerâncias, requisitos de segurança ou procedimentos que não estejam explicitamente escritos no contexto.',
    '- PROIBIDO INVENTAR SEÇÕES GENÉRICAS: nunca crie seções como "Controle de Qualidade", "Segurança Obrigatória", "Equipamentos Necessários", "Dicas", "Observações", "Boas Práticas" ou similares a partir do seu conhecimento geral. Só inclua esse tipo de seção se ela estiver literalmente presente no documento do setor.',
    '- PROIBIDO PERGUNTAS DE FECHAMENTO GENÉRICAS: não termine a resposta com frases como "Alguma dúvida sobre alguma etapa específica?", "Precisa de mais informações?", "Posso ajudar em algo mais?" a menos que o usuário tenha pedido isso.',
    '- Se a informação pedida não estiver no contexto, diga claramente: "Isso não está descrito no conhecimento do setor." Não preencha lacunas com conhecimento geral.',
    '- Cite fontes quando possível (título do documento/procedimento)',
    '- Reproduza o conteúdo com a mesma estrutura, ordem e terminologia do documento original',
    '- Formate com markdown quando apropriado, mas sem inventar títulos novos',
    '- BUSCA ATIVA E DESAMBIGUAÇÃO: antes de dizer que não encontrou um procedimento, verifique a lista "DOCUMENTOS QUE COINCIDEM COM A PERGUNTA" e todos os títulos listados em "Documentos do Setor". Se houver UM documento cujo título contém as palavras-chave da pergunta (mesmo com variações como "esquerdo", "direito", "v2", "novo"), USE-O como fonte. Se houver MÚLTIPLOS documentos candidatos, NÃO escolha sozinho: liste-os numerados (1, 2, 3...) e peça ao usuário para responder pelo número qual é o correto. Só diga que "não encontrou" quando NENHUM título/tag/conteúdo tiver relação com a pergunta.',
    '- REGRA OBRIGATÓRIA DE IMAGENS: se o documento que você está usando para responder contém marcadores [IMAGE:url], você DEVE inserir TODOS esses marcadores na sua resposta, exatamente como aparecem no contexto (formato: [IMAGE:https://...]), mesmo que o usuário não tenha pedido imagens. As imagens serão renderizadas automaticamente. Não descreva a imagem, apenas insira o marcador.',
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
