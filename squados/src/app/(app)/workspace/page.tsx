import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { WorkspaceShell } from '@/features/workspace/components/workspace-shell';

export default async function WorkspacePage() {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Fetch contacts (other users)
  const { data: contacts } = await admin
    .from('profiles')
    .select('id, full_name, email, role, status, avatar_url, sector_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('id', user.id)
    .order('full_name');

  // Fetch user's conversations with last message
  const { data: conversations } = await admin
    .from('conversations')
    .select('*')
    .contains('participant_ids', [user.id])
    .order('last_message_at', { ascending: false, nullsFirst: false });

  // Fetch user's groups
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, description, status')
    .eq('status', 'active');

  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  return (
    <WorkspaceShell
      currentUserId={user.id}
      currentUserName={profile.full_name}
      currentUserRole={profile.role}
      contacts={contacts ?? []}
      conversations={conversations ?? []}
      groups={groups ?? []}
      isAdmin={isAdmin}
    />
  );
}
