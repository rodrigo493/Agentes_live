import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getProductionDataAction } from '@/features/production/actions/production-actions';
import { getMyTasksAction } from '@/features/production/actions/task-actions';
import { getCalendarEventsAction, getGoogleConnectionAction } from '@/features/calendar/actions/calendar-actions';
import { ProductionShell } from '@/features/production/components/production-shell';
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns';

export const metadata = { title: 'Produção' };

export default async function ProducaoPage() {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  // Janela de 8 semanas (4 para trás, 4 para frente) para pré-carregar eventos
  const now = new Date();
  const calStart = startOfWeek(addWeeks(now, -4), { weekStartsOn: 0 }).toISOString();
  const calEnd   = endOfWeek(addWeeks(now, 4),   { weekStartsOn: 0 }).toISOString();

  const [
    { processes = [], media = [] },
    { tasks = [], completions = [] },
    contactsResult,
    { events: calendarEvents = [] },
    googleConn,
  ] = await Promise.all([
    getProductionDataAction(),
    getMyTasksAction(),
    isAdmin
      ? admin
          .from('profiles')
          .select('id, full_name, avatar_url, role')
          .eq('status', 'active')
          .is('deleted_at', null)
          .neq('id', user.id)
          .order('full_name')
      : Promise.resolve({ data: [] }),
    getCalendarEventsAction(calStart, calEnd),
    getGoogleConnectionAction(),
  ]);

  const contacts = (contactsResult.data ?? []) as {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  }[];

  return (
    <ProductionShell
      initialProcesses={processes}
      initialMedia={media}
      initialTasks={tasks}
      initialCompletions={completions}
      currentUserId={user.id}
      targetUserId={user.id}
      contacts={contacts}
      isAdmin={isAdmin}
      initialCalendarEvents={calendarEvents}
      googleConnected={googleConn.connected}
      googleEmail={googleConn.googleEmail}
      googleConfigured={googleConn.configured}
    />
  );
}
