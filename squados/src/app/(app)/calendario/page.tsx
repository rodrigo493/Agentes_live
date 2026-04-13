import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { getCalendarEventsAction, getGoogleConnectionAction } from '@/features/calendar/actions/calendar-actions';
import { CalendarSection } from '@/features/calendar/components/calendar-section';
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns';

export const metadata = { title: 'Calendário' };

export default async function CalendarioPage() {
  await getAuthenticatedUser();

  const now = new Date();
  const calStart = startOfWeek(addWeeks(now, -4), { weekStartsOn: 0 }).toISOString();
  const calEnd   = endOfWeek(addWeeks(now, 4),   { weekStartsOn: 0 }).toISOString();

  const [{ events: calendarEvents = [] }, googleConn] = await Promise.all([
    getCalendarEventsAction(calStart, calEnd),
    getGoogleConnectionAction(),
  ]);

  return (
    <div className="p-4 md:p-6">
      <CalendarSection
        initialEvents={calendarEvents}
        googleConnected={googleConn.connected}
        googleEmail={googleConn.googleEmail ?? null}
        googleConfigured={googleConn.configured}
      />
    </div>
  );
}
