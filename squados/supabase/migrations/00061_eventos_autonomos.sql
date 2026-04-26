-- Migration 00061: Tabela de eventos detectados pelos agentes autônomos
-- Fase 1: leitura e monitoramento — sem ações automáticas

CREATE TABLE IF NOT EXISTS eventos_autonomos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_da_organizacao   UUID        NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- Agente que detectou o evento
  id_do_agente        UUID        REFERENCES agentes_config(id) ON DELETE SET NULL,
  agente_nome         TEXT,

  -- Classificação do evento
  tipo                TEXT        NOT NULL, -- 'overdue', 'blocked', 'novo_pedido', 'expedicao', 'alerta'
  severidade          TEXT        NOT NULL DEFAULT 'info', -- 'info', 'aviso', 'critico'

  -- Referência ao objeto no kanban operacional
  workflow_step_id    UUID,       -- referência a workflow_steps.id (sem FK para não acoplar)
  workflow_ref        TEXT,       -- ex: "PA-0042", "PED-0123"
  step_titulo         TEXT,       -- ex: "Solda", "Expedição"

  -- Conteúdo
  titulo              TEXT        NOT NULL,
  descricao           TEXT,
  dados               JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Ciclo de vida
  lido                BOOLEAN     NOT NULL DEFAULT FALSE,
  resolvido           BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eventos_autonomos_org      ON eventos_autonomos(id_da_organizacao);
CREATE INDEX IF NOT EXISTS idx_eventos_autonomos_agente   ON eventos_autonomos(id_do_agente);
CREATE INDEX IF NOT EXISTS idx_eventos_autonomos_tipo     ON eventos_autonomos(tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_autonomos_nao_lido ON eventos_autonomos(lido, criado_em DESC) WHERE lido = FALSE;

COMMENT ON TABLE eventos_autonomos IS
'Feed de eventos detectados pelos agentes autônomos ao monitorar o kanban operacional. Fase 1: apenas leitura e registro.';

ALTER TABLE eventos_autonomos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam eventos_autonomos"
  ON eventos_autonomos USING (TRUE) WITH CHECK (TRUE);
