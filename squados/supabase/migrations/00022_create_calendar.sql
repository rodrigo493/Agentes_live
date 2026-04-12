-- ============================================================
-- Calendário: Eventos e Tokens Google Calendar
-- ============================================================

-- Tokens OAuth do Google Calendar por usuário
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  user_id       UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry  TIMESTAMPTZ NOT NULL,
  google_email  TEXT,
  calendar_id   TEXT NOT NULL DEFAULT 'primary',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eventos do calendário (sistema + Google Calendar)
CREATE TABLE IF NOT EXISTS calendar_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  google_event_id  TEXT,               -- null = evento só no sistema
  title            TEXT NOT NULL,
  description      TEXT,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  event_type       TEXT NOT NULL DEFAULT 'event'
                     CHECK (event_type IN ('task','meeting','call','event')),
  location         TEXT,
  meet_url         TEXT,
  is_all_day       BOOLEAN NOT NULL DEFAULT false,
  task_id          UUID REFERENCES production_tasks(id) ON DELETE SET NULL,
  reminder_minutes INTEGER NOT NULL DEFAULT 10,
  google_synced_at TIMESTAMPTZ,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cal_events_user_idx    ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS cal_events_range_idx   ON calendar_events(start_at, end_at);
CREATE INDEX IF NOT EXISTS cal_events_google_idx  ON calendar_events(google_event_id) WHERE google_event_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Tokens: só o próprio usuário
CREATE POLICY gct_select ON google_calendar_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY gct_insert ON google_calendar_tokens FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY gct_update ON google_calendar_tokens FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY gct_delete ON google_calendar_tokens FOR DELETE USING (user_id = auth.uid());

-- Eventos: usuário vê os seus; admin vê todos
CREATE POLICY cal_select ON calendar_events FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

CREATE POLICY cal_insert ON calendar_events FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
);

CREATE POLICY cal_update ON calendar_events FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
);

CREATE POLICY cal_delete ON calendar_events FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
);
