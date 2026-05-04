-- Migration 00067: Production Problems — módulo KPI de problemas recebidos do CRM Live

-- ── Tabela principal de problemas ────────────────────────────
CREATE TABLE IF NOT EXISTS production_problems (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  description  TEXT        NOT NULL,
  client_name  TEXT        NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL,
  crm_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_problems_received
  ON production_problems(received_at DESC);

-- ── Tabela de encaminhamentos ────────────────────────────────
CREATE TABLE IF NOT EXISTS problem_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id        UUID        NOT NULL REFERENCES production_problems(id) ON DELETE CASCADE,
  assigned_user_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solution          TEXT,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problem_assignments_problem
  ON problem_assignments(problem_id);

CREATE INDEX IF NOT EXISTS idx_problem_assignments_user
  ON problem_assignments(assigned_user_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE production_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos autenticados leem production_problems"
  ON production_problems FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE problem_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário lê seus encaminhamentos ou admin lê todos"
  ON problem_assignments FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );
-- Escrita somente pelo service role (RLS não bloqueia service role)
