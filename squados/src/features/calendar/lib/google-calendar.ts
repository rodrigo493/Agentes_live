/**
 * Google Calendar REST API helper
 * Usa chamadas REST diretas (sem googleapis SDK) para manter o bundle leve.
 *
 * Para ativar, configure no .env.local:
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   NEXT_PUBLIC_APP_URL=https://seu-dominio.com
 */

import { createAdminClient } from '@/shared/lib/supabase/admin';

const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars';

// ── OAuth URL ─────────────────────────────────────────────

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  `${process.env.APP_URL}/api/auth/google/calendar/callback`,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar',
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Exchange code for tokens ──────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  email?: string;
} | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${process.env.APP_URL}/api/auth/google/calendar/callback`,
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  // Decode id_token to get email if present
  let email: string | undefined;
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64').toString());
      email = payload.email;
    } catch { /* ignore */ }
  }

  return { ...data, email };
}

// ── Get valid access token (auto-refresh if expired) ─────

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('user_id', userId)
    .single();

  if (!row) return null;

  // Still valid (5-min buffer)
  if (new Date(row.token_expiry).getTime() > Date.now() + 5 * 60 * 1000) {
    return row.access_token;
  }

  // Refresh
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: row.refresh_token,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Google Token Refresh error]', res.status, JSON.stringify(err));
    return null;
  }
  const data = await res.json();
  if (!data.access_token) return null;

  await admin.from('google_calendar_tokens').update({
    access_token: data.access_token,
    token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  return data.access_token;
}

// ── Lista de agendas do usuário ───────────────────────────

export async function fetchGoogleCalendarList(accessToken: string): Promise<{
  id: string;
  summary: string;
  primary?: boolean;
}[] | null> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Google CalendarList error]', res.status, JSON.stringify(err));
    return null;
  }
  const data = await res.json();
  return data.items ?? [];
}

// ── Google Calendar API ───────────────────────────────────

export async function fetchGoogleEvents(
  accessToken: string,
  calendarId = 'primary',
  timeMin: string,
  timeMax: string
) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Google Events error]', res.status, JSON.stringify(err));
    return null;
  }
  const data = await res.json();
  return data.items ?? [];
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId = 'primary',
  event: {
    title: string;
    description?: string | null;
    start_at: string;
    end_at: string;
    location?: string | null;
    meet_url?: string | null;
  }
) {
  const body: Record<string, unknown> = {
    summary:     event.title,
    description: event.description ?? undefined,
    location:    event.location ?? undefined,
    start:       { dateTime: event.start_at },
    end:         { dateTime: event.end_at },
  };

  if (event.meet_url) {
    body.conferenceData = {
      entryPoints: [{ entryPointType: 'video', uri: event.meet_url }],
    };
  }

  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId = 'primary',
  googleEventId: string,
  event: {
    title?: string;
    description?: string | null;
    start_at?: string;
    end_at?: string;
    location?: string | null;
  }
) {
  const body: Record<string, unknown> = {};
  if (event.title)       body.summary     = event.title;
  if (event.description !== undefined) body.description = event.description ?? '';
  if (event.start_at)    body.start       = { dateTime: event.start_at };
  if (event.end_at)      body.end         = { dateTime: event.end_at };
  if (event.location !== undefined) body.location = event.location ?? '';

  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(calendarId)}/events/${googleEventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId = 'primary',
  googleEventId: string
) {
  await fetch(`${EVENTS_URL}/${encodeURIComponent(calendarId)}/events/${googleEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
