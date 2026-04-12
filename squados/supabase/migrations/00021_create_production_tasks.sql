-- ============================================================
-- Produção: Tarefas e Conclusões
-- ============================================================

CREATE TABLE IF NOT EXISTS production_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  assigned_to    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  frequency      TEXT NOT NULL DEFAULT 'once'
                   CHECK (frequency IN ('once', 'daily', 'weekly')),
  scheduled_time TIME NOT NULL,
  -- Para 'weekly': dia da semana (0=Dom, 1=Seg … 6=Sáb)
  scheduled_day  SMALLINT CHECK (scheduled_day BETWEEN 0 AND 6),
  -- Para 'once': data exata
  scheduled_date DATE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_task_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, completion_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS prod_tasks_assigned_idx  ON production_tasks(assigned_to) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS prod_tasks_freq_idx       ON production_tasks(frequency)   WHERE is_active = true;
CREATE INDEX IF NOT EXISTS prod_completions_date_idx ON production_task_completions(completion_date);
CREATE INDEX IF NOT EXISTS prod_completions_task_idx ON production_task_completions(task_id);

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_task_completions ENABLE ROW LEVEL SECURITY;

-- Leitura: usuário vê suas próprias tarefas; admin vê todas
CREATE POLICY prod_tasks_select ON production_tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );

-- Inserção: usuário cria apenas para si mesmo; admin cria para qualquer um
CREATE POLICY prod_tasks_insert ON production_tasks
  FOR INSERT WITH CHECK (
    (assigned_to = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );

-- Atualização: o próprio usuário ou admin
CREATE POLICY prod_tasks_update ON production_tasks
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );

-- Completions: leitura — o próprio usuário ou admin
CREATE POLICY prod_completions_select ON production_task_completions
  FOR SELECT TO authenticated
  USING (
    completed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );

-- Completions: inserção — o próprio usuário ou admin
CREATE POLICY prod_completions_insert ON production_task_completions
  FOR INSERT WITH CHECK (
    completed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );

-- Completions: exclusão (desfazer conclusão) — o próprio usuário ou admin
CREATE POLICY prod_completions_delete ON production_task_completions
  FOR DELETE USING (
    completed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  );
