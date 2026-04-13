'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import {
  getValidAccessToken,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  fetchGoogleEvents,
  fetchGoogleCalendarList,
} from '../lib/google-calendar';
import type { CalendarEvent } from '@/shared/types/database';

// ── Fetch events ─────────────────────────────────────────

export async function getCalendarEventsAction(
  startIso: string,
  endIso: string
): Promise<{ events?: CalendarEvent[]; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_at', startIso)
    .lte('end_at', endIso)
    .order('start_at');

  if (error) return { error: error.message };
  return { events: (data ?? []) as CalendarEvent[] };
}

// ── Check Google connection ───────────────────────────────

export async function getGoogleConnectionAction(): Promise<{
  connected: boolean;
  googleEmail?: string | null;
  configured: boolean;
}> {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) return { connected: false, configured: false };

  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from('google_calendar_tokens')
    .select('google_email')
    .eq('user_id', user.id)
    .maybeSingle();

  return { connected: !!data, googleEmail: data?.google_email, configured: true };
}

// ── Listar agendas do Google ──────────────────────────────

export async function getGoogleCalendarListAction(): Promise<{
  calendars?: { id: string; summary: string; primary?: boolean }[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) return { error: 'Token inválido' };
  const calendars = await fetchGoogleCalendarList(accessToken);
  if (!calendars) return { error: 'Falha ao buscar agendas' };
  return { calendars };
}

// ── Salvar agenda escolhida ───────────────────────────────

export async function setCalendarIdAction(calendarId: string): Promise<{ error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();
  await admin
    .from('google_calendar_tokens')
    .update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  return {};
}

// ── Disconnect Google ─────────────────────────────────────

export async function disconnectGoogleAction(): Promise<{ error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();
  await admin.from('google_calendar_tokens').delete().eq('user_id', user.id);
  return {};
}

// ── Sync from Google Calendar ─────────────────────────────

export async function syncFromGoogleAction(
  startIso: string,
  endIso: string
): Promise<{ synced?: number; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from('google_calendar_tokens')
    .select('calendar_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!tokenRow) return { error: 'Google Calendar não conectado' };

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) return { error: 'Falha ao obter token do Google' };

  const googleEvents = await fetchGoogleEvents(accessToken, tokenRow.calendar_id, startIso, endIso);
  if (!googleEvents) return { error: 'Falha ao buscar eventos do Google' };

  let synced = 0;
  for (const ge of googleEvents) {
    if (!ge.start || !ge.end) continue;

    const startAt = ge.start.dateTime ?? ge.start.date + 'T00:00:00Z';
    const endAt   = ge.end.dateTime   ?? ge.end.date   + 'T23:59:59Z';

    const { data: existing } = await admin
      .from('calendar_events')
      .select('id, google_synced_at')
      .eq('google_event_id', ge.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await admin.from('calendar_events').update({
        title:           ge.summary ?? '(sem título)',
        description:     ge.description ?? null,
        start_at:        startAt,
        end_at:          endAt,
        location:        ge.location ?? null,
        meet_url:        ge.hangoutLink ?? null,
        is_all_day:      !!ge.start.date,
        google_synced_at: new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await admin.from('calendar_events').insert({
        user_id:          user.id,
        google_event_id:  ge.id,
        title:            ge.summary ?? '(sem título)',
        description:      ge.description ?? null,
        start_at:         startAt,
        end_at:           endAt,
        event_type:       'event',
        location:         ge.location ?? null,
        meet_url:         ge.hangoutLink ?? null,
        is_all_day:       !!ge.start.date,
        google_synced_at: new Date().toISOString(),
        created_by:       user.id,
      });
    }
    synced++;
  }

  return { synced };
}

// ── Create event ──────────────────────────────────────────

export async function createCalendarEventAction(data: {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  event_type: 'task' | 'meeting' | 'call' | 'event';
  location?: string;
  meet_url?: string;
  is_all_day?: boolean;
  reminder_minutes?: number;
}): Promise<{ event?: CalendarEvent; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  let googleEventId: string | null = null;
  let googleSyncedAt: string | null = null;

  // Push to Google Calendar if connected
  const accessToken = await getValidAccessToken(user.id).catch(() => null);
  if (accessToken) {
    const { data: tokenRow } = await admin
      .from('google_calendar_tokens')
      .select('calendar_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const ge = await createGoogleEvent(accessToken, tokenRow?.calendar_id ?? 'primary', data);
    if (ge?.id) {
      googleEventId = ge.id;
      googleSyncedAt = new Date().toISOString();
    }
  }

  const { data: event, error } = await admin
    .from('calendar_events')
    .insert({
      user_id:          user.id,
      google_event_id:  googleEventId,
      title:            data.title.trim(),
      description:      data.description?.trim() || null,
      start_at:         data.start_at,
      end_at:           data.end_at,
      event_type:       data.event_type,
      location:         data.location?.trim() || null,
      meet_url:         data.meet_url?.trim() || null,
      is_all_day:       data.is_all_day ?? false,
      reminder_minutes: data.reminder_minutes ?? 10,
      google_synced_at: googleSyncedAt,
      created_by:       user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { event: event as CalendarEvent };
}

// ── Update event ──────────────────────────────────────────

export async function updateCalendarEventAction(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    start_at: string;
    end_at: string;
    event_type: string;
    location: string | null;
    meet_url: string | null;
    is_all_day: boolean;
    reminder_minutes: number;
  }>
): Promise<{ event?: CalendarEvent; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('calendar_events')
    .select('user_id, google_event_id')
    .eq('id', id)
    .single();
  if (!existing || existing.user_id !== user.id) return { error: 'Acesso negado' };

  // Sync to Google if connected
  if (existing.google_event_id) {
    const accessToken = await getValidAccessToken(user.id).catch(() => null);
    if (accessToken) {
      const { data: tokenRow } = await admin
        .from('google_calendar_tokens')
        .select('calendar_id')
        .eq('user_id', user.id)
        .maybeSingle();
      await updateGoogleEvent(accessToken, tokenRow?.calendar_id ?? 'primary', existing.google_event_id, data as Parameters<typeof updateGoogleEvent>[3]);
    }
  }

  const { data: event, error } = await admin
    .from('calendar_events')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { event: event as CalendarEvent };
}

// ── Delete event ──────────────────────────────────────────

export async function deleteCalendarEventAction(id: string): Promise<{ error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('calendar_events')
    .select('user_id, google_event_id')
    .eq('id', id)
    .single();
  if (!existing || existing.user_id !== user.id) return { error: 'Acesso negado' };

  if (existing.google_event_id) {
    const accessToken = await getValidAccessToken(user.id).catch(() => null);
    if (accessToken) {
      const { data: tokenRow } = await admin
        .from('google_calendar_tokens')
        .select('calendar_id')
        .eq('user_id', user.id)
        .maybeSingle();
      await deleteGoogleEvent(accessToken, tokenRow?.calendar_id ?? 'primary', existing.google_event_id);
    }
  }

  const { error } = await admin.from('calendar_events').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
