import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AgentChatShell } from '@/features/chat-agent/components/agent-chat-shell';
import { redirect } from 'next/navigation';

/**
 * Regras de acesso ao chat por setor:
 * - Usuário normal: só vê o agente do SEU setor
 * - CEO: acesso a TODOS os setores de fábrica
 * - Governança/Conselho: sabem tudo sobre CEO e Presidente
 * - Presidente: recebe informações resumidas do CEO, Conselho e Governança
 */

async function getSectorsForUser(profile: any, admin: any) {
  const sectorSlug = await getSectorSlug(profile.sector_id, admin);

  switch (sectorSlug) {
    case 'ceo':
      // CEO acessa TODOS os setores
      const { data: allSectors } = await admin
        .from('sectors')
        .select('id, name, slug, agent_id, agents!fk_sectors_agent(id, display_name, status)')
        .eq('is_active', true)
        .order('name');
      return allSectors ?? [];

    case 'governanca':
    case 'conselho':
      // Governança e Conselho sabem tudo sobre CEO e Presidente + seu próprio setor
      const { data: govSectors } = await admin
        .from('sectors')
        .select('id, name, slug, agent_id, agents!fk_sectors_agent(id, display_name, status)')
        .eq('is_active', true)
        .in('slug', [sectorSlug, 'ceo', 'presidencia'])
        .order('name');
      return govSectors ?? [];

    case 'presidencia':
      // Presidente acessa CEO, Conselho, Governança + seu próprio setor
      const { data: presSectors } = await admin
        .from('sectors')
        .select('id, name, slug, agent_id, agents!fk_sectors_agent(id, display_name, status)')
        .eq('is_active', true)
        .in('slug', ['presidencia', 'ceo', 'conselho', 'governanca'])
        .order('name');
      return presSectors ?? [];

    default:
      // Usuário normal: só o seu setor
      if (!profile.sector_id) return [];
      const { data: userSector } = await admin
        .from('sectors')
        .select('id, name, slug, agent_id, agents!fk_sectors_agent(id, display_name, status)')
        .eq('id', profile.sector_id)
        .single();
      return userSector ? [userSector] : [];
  }
}

async function getSectorSlug(sectorId: string | null, admin: any): Promise<string | null> {
  if (!sectorId) return null;
  const { data } = await admin.from('sectors').select('slug').eq('id', sectorId).single();
  return data?.slug ?? null;
}

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ sector?: string }> }) {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();
  const params = await searchParams;

  if (!profile.sector_id) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Sem setor vinculado</p>
          <p className="text-sm text-muted-foreground">
            Peça a um administrador para vincular você a um setor.
          </p>
        </div>
      </div>
    );
  }

  // Buscar setores disponíveis para este usuário
  const availableSectors = await getSectorsForUser(profile, admin);

  if (availableSectors.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Nenhum agente disponível</p>
          <p className="text-sm text-muted-foreground">
            Seu setor ainda não possui um agente configurado.
          </p>
        </div>
      </div>
    );
  }

  // Setor selecionado via query param ou padrão (setor do usuário)
  const selectedByParam = params.sector
    ? availableSectors.find((s: any) => s.slug === params.sector)
    : null;
  const primarySector = selectedByParam ?? availableSectors.find((s: any) => s.id === profile.sector_id) ?? availableSectors[0];
  const sectorId = primarySector.id;
  const sectorName = primarySector.name;
  const agent = primarySector.agents as any;
  const agentName = agent?.display_name ?? '';

  // Fetch sector knowledge docs
  const { data: knowledgeDocs } = await admin
    .from('knowledge_docs')
    .select('id, title, doc_type, tags, created_at')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  // Fetch sector knowledge memory (validated)
  const { data: knowledgeMemory } = await admin
    .from('knowledge_memory')
    .select('id, title, category, confidence_score, tags, created_at')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .in('validation_status', ['auto_validated', 'human_validated'])
    .order('confidence_score', { ascending: false })
    .limit(20);

  // Get or create agent conversation
  let conversationId: string | null = null;
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

  // Preparar lista de setores disponíveis para o seletor (multi-setor para CEO/Presidente/etc)
  const sectorOptions = availableSectors.map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
  }));

  return (
    <AgentChatShell
      currentUserId={user.id}
      currentUserName={profile.full_name}
      sectorId={sectorId}
      sectorName={sectorName}
      agentName={agentName}
      conversationId={conversationId ?? ''}
      initialMessages={initialMessages}
      knowledgeDocs={knowledgeDocs ?? []}
      knowledgeMemory={knowledgeMemory ?? []}
      availableSectors={sectorOptions}
    />
  );
}
