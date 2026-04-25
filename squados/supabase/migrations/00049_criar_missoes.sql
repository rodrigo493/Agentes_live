-- ============================================================
-- Missões — ponto de entrada para workflows do SquadOS
-- ENUM para status garante integridade sem validação no app
-- ============================================================

CREATE TYPE status_missao AS ENUM (
  'Backlog',
  'Planejamento',
  'Em Execução',
  'Concluída',
  'Cancelada'
);

CREATE TABLE IF NOT EXISTS missoes (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_da_organizacao   UUID          NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- Título curto para identificação rápida
  titulo              TEXT          NOT NULL,

  -- Descrição completa da missão, como fornecida pelo usuário
  descricao           TEXT          NOT NULL,

  -- Toda nova missão começa como Backlog
  status              status_missao NOT NULL DEFAULT 'Backlog',

  -- Agente líder (normalmente a Orquestradora); nullable para flexibilidade
  id_do_responsavel   UUID          REFERENCES agentes_config(id) ON DELETE SET NULL,

  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missoes_organizacao ON missoes(id_da_organizacao);
CREATE INDEX IF NOT EXISTS idx_missoes_status       ON missoes(status);

COMMENT ON TABLE missoes IS 'Missões de alto nível de cada organização — ponto de partida para os workflows da Orquestradora.';

CREATE OR REPLACE FUNCTION update_missoes_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_missoes_atualizado_em
  BEFORE UPDATE ON missoes
  FOR EACH ROW
  EXECUTE FUNCTION update_missoes_atualizado_em();

ALTER TABLE missoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam missoes"
  ON missoes
  USING (TRUE)
  WITH CHECK (TRUE);
