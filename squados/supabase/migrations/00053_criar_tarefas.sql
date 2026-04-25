-- ============================================================
-- Tarefas — unidades de trabalho extraídas de um workflow aprovado
-- Cada tarefa é atribuída a um agente especialista e pode
-- depender da conclusão de outras tarefas (depende_de[])
-- ============================================================

CREATE TYPE status_tarefa AS ENUM (
  'Pendente',
  'Em Andamento',
  'Bloqueada',
  'Em Revisão',
  'Concluída'
);

CREATE TABLE IF NOT EXISTS tarefas (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  id_da_organizacao   UUID          NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  id_do_workflow      UUID          NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,

  titulo              VARCHAR(255)  NOT NULL,
  descricao           TEXT,

  status              status_tarefa NOT NULL DEFAULT 'Pendente',

  id_do_responsavel   UUID          REFERENCES agentes_config(id) ON DELETE SET NULL,

  -- IDs de tarefas que precisam estar Concluídas antes desta poder começar
  depende_de          UUID[]        NOT NULL DEFAULT '{}',

  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_workflow    ON tarefas(id_do_workflow);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(id_do_responsavel);
CREATE INDEX IF NOT EXISTS idx_tarefas_status      ON tarefas(status);

COMMENT ON TABLE tarefas IS 'Unidades de trabalho de um workflow aprovado — cada uma atribuída a um agente especialista.';
COMMENT ON COLUMN tarefas.depende_de IS 'Array de tarefas.id que devem estar Concluídas antes desta tarefa poder ser iniciada.';

CREATE OR REPLACE FUNCTION update_tarefas_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tarefas_atualizado_em
  BEFORE UPDATE ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION update_tarefas_atualizado_em();

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam tarefas"
  ON tarefas
  USING (TRUE)
  WITH CHECK (TRUE);
