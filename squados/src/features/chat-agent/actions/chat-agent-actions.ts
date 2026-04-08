'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { canAccess } from '@/shared/lib/rbac/permissions';
import { processRawMessageAction } from '@/features/memory/actions/memory-actions';
import { generateAgentResponse } from '@/features/agents/lib/agent-ai';
import { analyzeMessageWithMaestro } from '@/features/agents/lib/maestro';

export async function getOrCreateAgentConversation() {
  const { user, profile } = await getAuthenticatedUser();

  if (!canAccess(profile.role, 'chat_agent', 'read')) {
    return { error: 'Sem permissão para chat com agente' };
  }

  if (!profile.sector_id) {
    return { error: 'Você precisa estar vinculado a um setor para usar o chat com agente' };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'agent')
    .eq('sector_id', profile.sector_id)
    .contains('participant_ids', [user.id])
    .limit(1)
    .single();

  if (existing) return { data: existing };

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      type: 'agent' as const,
      sector_id: profile.sector_id,
      participant_ids: [user.id],
      title: 'Chat com Agente',
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function sendAgentMessageAction(conversationId: string, content: string) {
  const { user, profile } = await getAuthenticatedUser();

  if (!canAccess(profile.role, 'chat_agent', 'write')) {
    return { error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Save user message
  const { data: userMsg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_type: 'user' as const,
      content,
      content_type: 'text' as const,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Pipeline: mensagem bruta → processed_memory (Camada 2)
  if (profile.sector_id) {
    await processRawMessageAction({
      messageId: userMsg.id,
      conversationId,
      sectorId: profile.sector_id,
      sourceType: 'chat_agent',
      content,
      userId: user.id,
      context: {
        conversation_id: conversationId,
        channel: 'chat_agent',
      },
    });
  }

  // Maestro analisa a mensagem em background (não bloqueia o chat)
  if (profile.sector_id) {
    const { data: sectorInfo } = await admin
      .from('sectors')
      .select('name')
      .eq('id', profile.sector_id)
      .single();

    analyzeMessageWithMaestro({
      messageContent: content,
      senderName: profile.full_name,
      sectorId: profile.sector_id,
      sectorName: sectorInfo?.name ?? '',
      conversationId,
      messageId: userMsg.id,
    }).catch(() => {}); // fire-and-forget
  }

  // Buscar agente do setor
  let agentId = '';
  if (profile.sector_id) {
    const { data: sector } = await admin
      .from('sectors')
      .select('agent_id')
      .eq('id', profile.sector_id)
      .single();

    if (sector?.agent_id) {
      agentId = sector.agent_id;
    } else {
      // Buscar qualquer agente specialist do setor
      const { data: sectorAgent } = await admin
        .from('agents')
        .select('id')
        .eq('sector_id', profile.sector_id)
        .eq('type', 'specialist')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (sectorAgent) agentId = sectorAgent.id;
    }
  }

  // Buscar histórico para contexto
  const { data: historyMsgs } = await admin
    .from('messages')
    .select('sender_type, content')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(30);

  const conversationHistory = (historyMsgs ?? [])
    .filter((m) => m.sender_type !== 'system')
    .slice(0, -1) // excluir a mensagem atual (já enviada)
    .map((m) => ({
      role: (m.sender_type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

  // Gerar resposta com Claude
  const aiResponse = await generateAgentResponse({
    agentId,
    sectorId: profile.sector_id ?? '',
    userId: user.id,
    userMessage: content,
    conversationHistory,
  });

  // Salvar resposta do agente
  const { data: agentMsg } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: null,
      sender_type: 'agent' as const,
      content: aiResponse.content,
      content_type: 'text' as const,
      metadata: {
        model: aiResponse.model,
        tokens_used: aiResponse.tokensUsed,
        agent_id: agentId || null,
      },
    })
    .select()
    .single();

  return { data: { userMessage: userMsg, agentMessage: agentMsg } };
}

export async function getAgentChatHistoryAction(conversationId: string) {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data };
}
