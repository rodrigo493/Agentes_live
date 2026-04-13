-- ============================================================
-- Workflow Engine — fluxos de trabalho inter-setores
-- Fase 1 MVP: templates fixos, instâncias, etapas com SLA, bloqueios
-- ============================================================

-- ── Enums ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE workflow_step_status AS ENUM
    ('pending','in_progress','done','blocked','overdue','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workflow_instance_status AS ENUM
    ('running','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Templates de fluxo (fixos, criados por admin+) ──────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT 'violet',
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Etapas ordenadas do template ────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_template_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  assignee_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_sector_id  UUID REFERENCES sectors(id) ON DELETE SET NULL,
  sla_hours           NUMERIC NOT NULL DEFAULT 24 CHECK (sla_hours > 0),
  payload_schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, step_order),
  CHECK (assignee_user_id IS NOT NULL OR assignee_sector_id IS NOT NULL)
);

-- ── Instâncias em execução ──────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE RESTRICT,
  reference       TEXT NOT NULL,
  title           TEXT,
  status          workflow_instance_status NOT NULL DEFAULT 'running',
  started_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  current_step_id UUID,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ── Execução de cada etapa ──────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  template_step_id   UUID NOT NULL REFERENCES workflow_template_steps(id) ON DELETE RESTRICT,
  step_order         INTEGER NOT NULL,
  assignee_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  status             workflow_step_status NOT NULL DEFAULT 'pending',
  started_at         TIMESTAMPTZ,
  due_at             TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  completed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  payload_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  block_reason_code  TEXT,
  block_reason_text  TEXT,
  blocked_at         TIMESTAMPTZ,
  blocked_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instance_id, step_order)
);

ALTER TABLE workflow_instances
  ADD CONSTRAINT workflow_instances_current_step_fk
  FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- ── Catálogo de motivos de bloqueio ─────────────────────────
CREATE TABLE IF NOT EXISTS workflow_block_reasons (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'outros',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS wf_tmpl_active_idx        ON workflow_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS wf_tmpl_steps_tmpl_idx    ON workflow_template_steps(template_id, step_order);
CREATE INDEX IF NOT EXISTS wf_inst_status_idx        ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS wf_inst_started_by_idx    ON workflow_instances(started_by);
CREATE INDEX IF NOT EXISTS wf_steps_assignee_idx     ON workflow_steps(assignee_id, status);
CREATE INDEX IF NOT EXISTS wf_steps_due_idx          ON workflow_steps(status, due_at) WHERE status IN ('pending','in_progress');
CREATE INDEX IF NOT EXISTS wf_steps_instance_idx     ON workflow_steps(instance_id, step_order);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE workflow_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_template_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_block_reasons    ENABLE ROW LEVEL SECURITY;

-- templates: leitura todos, escrita admin+
CREATE POLICY wf_tmpl_select ON workflow_templates
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY wf_tmpl_insert ON workflow_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_tmpl_update ON workflow_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- template_steps: leitura todos, escrita admin+
CREATE POLICY wf_tmpl_steps_select ON workflow_template_steps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY wf_tmpl_steps_insert ON workflow_template_steps
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_tmpl_steps_update ON workflow_template_steps
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_tmpl_steps_delete ON workflow_template_steps
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- instances: quem iniciou OU é assignee de alguma etapa OU admin+
CREATE POLICY wf_inst_select ON workflow_instances
  FOR SELECT TO authenticated USING (
    started_by = auth.uid()
    OR EXISTS (SELECT 1 FROM workflow_steps s WHERE s.instance_id = workflow_instances.id AND s.assignee_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_inst_insert ON workflow_instances
  FOR INSERT WITH CHECK (started_by = auth.uid());
CREATE POLICY wf_inst_update ON workflow_instances
  FOR UPDATE USING (
    started_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- steps: assignee OR quem iniciou a instance OR admin+
CREATE POLICY wf_steps_select ON workflow_steps
  FOR SELECT TO authenticated USING (
    assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workflow_instances i WHERE i.id = instance_id AND i.started_by = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_steps_update ON workflow_steps
  FOR UPDATE USING (
    assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- block_reasons: leitura todos, escrita master_admin
CREATE POLICY wf_br_select ON workflow_block_reasons
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY wf_br_insert ON workflow_block_reasons
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master_admin')
  );
CREATE POLICY wf_br_update ON workflow_block_reasons
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master_admin')
  );

-- ── Seed: motivos de bloqueio padrão ────────────────────────
INSERT INTO workflow_block_reasons (code, label, category) VALUES
  ('sem_produto',       'Sem produto em estoque',         'operacional'),
  ('aguardando_cliente','Aguardando retorno do cliente',  'externo'),
  ('erro_fiscal',       'Erro fiscal / nota',             'administrativo'),
  ('aguardando_aprovacao','Aguardando aprovação interna', 'interno'),
  ('informacao_faltante','Informação faltante',           'interno'),
  ('problema_tecnico',  'Problema técnico',               'operacional'),
  ('outro',             'Outro motivo',                   'outros')
ON CONFLICT (code) DO NOTHING;

-- ── Updated_at triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_workflow_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wf_tmpl_updated ON workflow_templates;
CREATE TRIGGER trg_wf_tmpl_updated
  BEFORE UPDATE ON workflow_templates
  FOR EACH ROW EXECUTE FUNCTION update_workflow_templates_updated_at();
