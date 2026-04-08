import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AgentChatShell } from '@/features/chat-agent/components/agent-chat-shell';

export default async function ChatPage() {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Get user's sector info
  let sectorName = '';
  let sectorId = profile.sector_id;
  let agentName = '';

  if (sectorId) {
    const { data: sector } = await admin
      .from('sectors')
      .select('id, name, slug, agents!fk_sectors_agent(id, display_name, status)')
      .eq('id', sectorId)
      .single();

    if (sector) {
      sectorName = sector.name;
      const agent = sector.agents as any;
      if (agent) agentName = agent.display_name;
    }
  }

  // If user has no sector, pick the first active one
  if (!sectorId) {
    const { data: firstSector } = await admin
      .from('sectors')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .limit(1)
      .single();

    if (firstSector) {
      sectorId = firstSector.id;
      sectorName = firstSector.name;
    }
  }

  // Fetch sector knowledge docs
  const { data: knowledgeDocs } = await admin
    .from('knowledge_docs')
    .select('id, title, doc_type, tags, created_at')
    .eq('sector_id', sectorId ?? '__none__')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  // Fetch sector knowledge memory (validated)
  const { data: knowledgeMemory } = await admin
    .from('knowledge_memory')
    .select('id, title, category, confidence_score, tags, created_at')
    .eq('sector_id', sectorId ?? '__none__')
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(20);

  // Get or create agent conversation
  let conversationId: string | null = null;
  if (sectorId) {
    const { data: existingConv } = await admin
      .from('conversations')
      .select('id')
      .eq('type', 'agent')
      .eq('sector_id', sectorId)
      .contains('participant_ids', [user.id])
      .limit(1)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await admin
        .from('conversations')
        .insert({
          type: 'agent',
          sector_id: sectorId,
          participant_ids: [user.id],
          title: `Chat com Agente - ${sectorName}`,
        })
        .select('id')
        .single();

      if (newConv) conversationId = newConv.id;
    }
  }

  // Fetch existing messages
  let initialMessages: any[] = [];
  if (conversationId) {
    const { data: msgs } = await admin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(100);

    initialMessages = msgs ?? [];
  }

  return (
    <AgentChatShell
      currentUserId={user.id}
      currentUserName={profile.full_name}
      sectorId={sectorId ?? ''}
      sectorName={sectorName}
      agentName={agentName}
      conversationId={conversationId ?? ''}
      initialMessages={initialMessages}
      knowledgeDocs={knowledgeDocs ?? []}
      knowledgeMemory={knowledgeMemory ?? []}
    />
  );
}
