import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { getMessagesAction } from '@/features/workspace/actions/workspace-actions';
import { MessageThread } from '@/features/workspace/components/message-thread';

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, profile } = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('name, description')
    .eq('id', groupId)
    .single();

  if (!group) {
    return <div className="p-6 text-destructive">Grupo não encontrado</div>;
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('group_id', groupId)
    .eq('type', 'group')
    .single();

  if (!conv) {
    return <div className="p-6 text-destructive">Conversa do grupo não encontrada</div>;
  }

  const messagesResult = await getMessagesAction(conv.id);

  return (
    <div className="h-full">
      <MessageThread
        conversationId={conv.id}
        currentUserId={user.id}
        currentUserName={profile.full_name}
        title={group.name}
        initialMessages={messagesResult.data ?? []}
      />
    </div>
  );
}
