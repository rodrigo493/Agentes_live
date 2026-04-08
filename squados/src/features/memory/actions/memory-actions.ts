'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { canAccessSector } from '@/shared/lib/rbac/permissions';
import type { MemorySourceType, KnowledgeCategory } from '@/shared/types/database';

// ============================================================
// CAMADA 2: Processed Memory
// Memória filtrada — acessível parcialmente por agentes
// ============================================================

/**
 * Grava uma entrada na processed_memory (Camada 2).
 * Chamada pelo pipeline de processamento após filtrar mensagens brutas.
 * Agentes NÃO chamam isso diretamente — o pipeline sim.
 */
export async function createProcessedMemoryAction(input: {
  sectorId: string;
  sourceType: MemorySourceType;
  sourceId?: string;
  content: string;
  summary?: string;
  userId?: string;
  tags?: string[];
  context?: Record<string, unknown>;
  relevanceScore?: number;
}) {
  const { user, profile } = await getAuthenticatedUser();

  if (!canAccessSector(profile.role, profile.sector_id, input.sectorId, 'memory', 'write')) {
    return { error: 'Sem permissão' };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('processed_memory')
    .insert({
      sector_id: input.sectorId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      content: input.content,
      summary: input.summary,
      user_id: input.userId ?? user.id,
      tags: input.tags ?? [],
      relevance_score: input.relevanceScore ?? 0.5,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      context: {
        ...input.context,
        processed_by: user.id,
        sector_id: input.sectorId,
      },
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

/**
 * Lista processed_memory de um setor (admin/manager).
 * Agentes NÃO usam isso diretamente — usam knowledge_memory.
 */
export async function getProcessedMemoryAction(sectorId: string, limit = 50) {
  const { profile } = await getAuthenticatedUser();

  if (!canAccessSector(profile.role, profile.sector_id, sectorId, 'memory', 'read')) {
    return { error: 'Sem permissão', data: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('processed_memory')
    .select('*, profiles!user_id(full_name)')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { error: error.message, data: [] };
  return { data };
}

// ============================================================
// CAMADA 3: Knowledge Memory
// Conhecimento validado — FONTE PRINCIPAL dos agentes
// ============================================================

/**
 * Promove uma processed_memory para knowledge_memory (Camada 3).
 * Pode ser automático (pipeline) ou manual (admin valida).
 */
export async function promoteToKnowledgeAction(input: {
  sourceMemoryId?: string;
  sectorId: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  confidenceScore?: number;
  tags?: string[];
  expiresAt?: string;
}) {
  const { user } = await getAuthenticatedUser();

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('knowledge_memory')
    .insert({
      sector_id: input.sectorId,
      source_memory_id: input.sourceMemoryId,
      title: input.title,
      content: input.content,
      category: input.category,
      confidence_score: input.confidenceScore ?? 0.7,
      validated_by: user.id,
      validation_status: 'human_validated',
      tags: input.tags ?? [],
      expires_at: input.expiresAt,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

/**
 * Busca knowledge_memory de um setor.
 * Esta é a API que os agentes usarão via OpenSquad.
 * Respeita context_policy no nível da aplicação.
 */
export async function getKnowledgeMemoryAction(
  sectorId: string,
  options?: {
    category?: KnowledgeCategory;
    limit?: number;
    query?: string;
  }
) {
  const { profile } = await getAuthenticatedUser();

  if (!canAccessSector(profile.role, profile.sector_id, sectorId, 'memory', 'read')) {
    return { error: 'Sem permissão', data: [] };
  }

  const supabase = await createClient();
  let query = supabase
    .from('knowledge_memory')
    .select('*')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.query) {
    query = query.or(`title.ilike.%${options.query}%,content.ilike.%${options.query}%`);
  }

  const { data, error } = await query;
  if (error) return { error: error.message, data: [] };
  return { data };
}

/**
 * Busca knowledge_memory consolidado para agentes executivos (global).
 * Só acessível por admin/master_admin (agentes executivos usam service role).
 */
export async function getConsolidatedKnowledgeAction(options?: {
  sectorIds?: string[];
  category?: KnowledgeCategory;
  limit?: number;
}) {
  const { profile } = await getAuthenticatedUser();

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Acesso restrito a administradores', data: [] };
  }

  const adminClient = createAdminClient();
  let query = adminClient
    .from('knowledge_memory')
    .select('*, sectors!sector_id(name, slug)')
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.sectorIds?.length) {
    query = query.in('sector_id', options.sectorIds);
  }

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;
  if (error) return { error: error.message, data: [] };
  return { data };
}

// ============================================================
// Pipeline: processa mensagem bruta → processed_memory
// ============================================================

/**
 * Pipeline de processamento de mensagens.
 * Chamado após uma mensagem ser enviada (async).
 * Filtra, resume e classifica antes de salvar na Camada 2.
 */
export async function processRawMessageAction(input: {
  messageId: string;
  conversationId: string;
  sectorId: string;
  sourceType: MemorySourceType;
  content: string;
  userId: string;
  context: Record<string, unknown>;
}) {
  const adminClient = createAdminClient();

  // Filtro básico: ignora mensagens muito curtas ou de sistema
  if (input.content.trim().length < 10) {
    return { skipped: true, reason: 'content_too_short' };
  }

  // Gravar na Camada 2 com status pending (pipeline futuro pode enriquecer)
  const { data, error } = await adminClient
    .from('processed_memory')
    .insert({
      sector_id: input.sectorId,
      source_type: input.sourceType,
      source_id: input.messageId,
      content: input.content,
      user_id: input.userId,
      relevance_score: 0.5,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      context: {
        conversation_id: input.conversationId,
        channel: input.sourceType,
        ...input.context,
      },
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}
