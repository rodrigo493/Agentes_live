import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { getOrCreateDMConversation, getMessagesAction } from '@/features/workspace/actions/workspace-actions';
import { MessageThread } from '@/features/workspace/components/message-thread';

export default async function DMPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { user, profile } = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data: otherUser } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single();

  if (!otherUser) {
    return <div className="p-6 text-destructive">Usuário não encontrado</div>;
  }

  const convResult = await getOrCreateDMConversation(userId);
  if (!convResult.data) {
    return <div className="p-6 text-destructive">Erro ao abrir conversa</div>;
  }

  const messagesResult = await getMessagesAction(convResult.data.id);

  return (
    <div className="h-full">
      <MessageThread
        conversationId={convResult.data.id}
        currentUserId={user.id}
        currentUserName={profile.full_name}
        title={otherUser.full_name}
        initialMessages={messagesResult.data ?? []}
      />
    </div>
  );
}
