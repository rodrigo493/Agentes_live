import type { AgentContextPolicy } from '@/shared/types/database';
import { createAdminClient } from '@/shared/lib/supabase/admin';

/**
 * Busca knowledge_memory respeitando a context_policy do agente.
 * Esta é a API que o OpenSquad chamará para alimentar os agentes.
 *
 * REGRA INVIOLÁVEL: Agentes NUNCA acessam `messages` diretamente.
 * Apenas knowledge_memory (Camada 3) e, conforme policy, processed_memory (Camada 2).
 */
export async function getAgentContext(params: {
  agentId: string;
  sectorId: string;
  userId?: string;
  query?: string;
  limit?: number;
}) {
  const adminClient = createAdminClient();

  // Buscar context_policy do agente
  const { data: agent } = await adminClient
    .from('agents')
    .select('context_policy, type, sector_id')
    .eq('id', params.agentId)
    .single();

  if (!agent) return { error: 'Agente não encontrado', data: [] };

  const policy = agent.context_policy as AgentContextPolicy;
  const limit = params.limit ?? 30;

  // CAMADA 3: knowledge_memory (sempre acessível, filtrado por policy)
  let knowledgeQuery = adminClient
    .from('knowledge_memory')
    .select('id, sector_id, title, content, category, confidence_score, tags, created_at')
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(limit);

  switch (policy) {
    case 'own_user_only':
      // Conhecimento do setor, mas sem processed_memory
      knowledgeQuery = knowledgeQuery.eq('sector_id', params.sectorId);
      break;

    case 'group_if_relevant':
      // Conhecimento do setor
      knowledgeQuery = knowledgeQuery.eq('sector_id', params.sectorId);
      break;

    case 'sector_only':
      // Conhecimento completo do setor
      knowledgeQuery = knowledgeQuery.eq('sector_id', params.sectorId);
      break;

    case 'global_executive':
      // Acesso total — sem filtro de setor
      break;
  }

  if (params.query) {
    knowledgeQuery = knowledgeQuery.or(
      `title.ilike.%${params.query}%,content.ilike.%${params.query}%`
    );
  }

  const { data: knowledge, error: kError } = await knowledgeQuery;
  if (kError) return { error: kError.message, data: [] };

  // CAMADA 2: processed_memory (apenas para policies que permitem)
  let processedData: unknown[] = [];

  if (policy === 'sector_only' || policy === 'global_executive' || policy === 'group_if_relevant') {
    let processedQuery = adminClient
      .from('processed_memory')
      .select('id, sector_id, source_type, content, summary, tags, relevance_score, created_at')
      .eq('is_active', true)
      .eq('processing_status', 'completed')
      .order('relevance_score', { ascending: false })
      .limit(Math.floor(limit / 2)); // metade do limite para não poluir

    if (policy !== 'global_executive') {
      processedQuery = processedQuery.eq('sector_id', params.sectorId);
    }

    // Para group_if_relevant, filtrar apenas fontes de grupo
    if (policy === 'group_if_relevant') {
      processedQuery = processedQuery.in('source_type', ['workspace_group', 'chat_agent']);
    }

    const { data: processed } = await processedQuery;
    processedData = processed ?? [];
  }

  return {
    data: {
      knowledge: knowledge ?? [],
      processed: processedData,
      policy,
      agentType: agent.type,
    },
  };
}
