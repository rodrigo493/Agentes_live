import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getMyTasksAction } from '@/features/production/actions/task-actions';
import { getAssignmentsAction } from '@/features/processes/actions/assignment-actions';
import { getCatalogAction } from '@/features/processes/actions/catalog-actions';
import { ProductionShell } from '@/features/production/components/production-shell';

export const metadata = { title: 'Produção' };

export default async function ProducaoPage() {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const [
    { assignments = [] },
    { tasks = [], completions = [] },
    { processes: catalogProcesses = [] },
    contactsResult,
  ] = await Promise.all([
    getAssignmentsAction(),
    getMyTasksAction(),
    isAdmin ? getCatalogAction() : Promise.resolve({ processes: [] }),
    isAdmin
      ? admin
          .from('profiles')
          .select('id, full_name, avatar_url, role')
          .eq('status', 'active')
          .is('deleted_at', null)
          .neq('id', user.id)
          .order('full_name')
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = (contactsResult.data ?? []) as {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  }[];

  return (
    <ProductionShell
      initialAssignments={assignments}
      initialTasks={tasks}
      initialCompletions={completions}
      currentUserId={user.id}
      targetUserId={user.id}
      contacts={contacts}
      isAdmin={isAdmin}
      catalogProcesses={catalogProcesses}
    />
  );
}
