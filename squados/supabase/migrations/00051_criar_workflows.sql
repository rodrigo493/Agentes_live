-- ============================================================
-- Workflows — resultado do planejamento da Orquestradora
-- Cada workflow pertence a uma missão e tem um agente criador
-- ============================================================

CREATE TYPE status_workflow AS ENUM (
  'Rascunho',
  'Aguardando Aprovação',
  'Aprovado',
  'Em Execução',
  'Concluído'
);

CREATE TABLE IF NOT EXISTS workflows (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Todo workflow nasce de uma missão
  id_da_missao          UUID            NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,

  -- Agente que planejou o workflow (normalmente a Orquestradora)
  id_do_agente_criador  UUID            NOT NULL REFERENCES agentes_config(id),

  -- Conteúdo do plano em Markdown: fases, papéis, checkpoints
  conteudo              TEXT            NOT NULL,

  status                status_workflow NOT NULL DEFAULT 'Rascunho',

  criado_em             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_missao ON workflows(id_da_missao);
CREATE INDEX IF NOT EXISTS idx_workflows_status  ON workflows(status);

COMMENT ON TABLE workflows IS 'Planos de trabalho criados pela Orquestradora para cada missão — fases, papéis e checkpoints.';

CREATE OR REPLACE FUNCTION update_workflows_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workflows_atualizado_em
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflows_atualizado_em();

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam workflows"
  ON workflows
  USING (TRUE)
  WITH CHECK (TRUE);
