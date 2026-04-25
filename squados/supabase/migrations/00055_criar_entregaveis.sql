-- ============================================================
-- Entregáveis — resultados produzidos pelos agentes especialistas
-- Cada entregável é o output de uma tarefa concluída
-- ============================================================

CREATE TABLE IF NOT EXISTS entregaveis (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  id_da_organizacao     UUID          NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- Toda entrega é o resultado de uma tarefa específica
  id_da_tarefa          UUID          NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,

  -- O especialista que produziu o trabalho
  id_do_agente_executor UUID          NOT NULL REFERENCES agentes_config(id),

  -- O conteúdo do trabalho (relatório, rascunho, análise)
  conteudo              TEXT          NOT NULL,

  -- Como interpretar o conteúdo
  formato               VARCHAR(50)   NOT NULL DEFAULT 'markdown',

  criado_em             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entregaveis_tarefa  ON entregaveis(id_da_tarefa);
CREATE INDEX IF NOT EXISTS idx_entregaveis_agente  ON entregaveis(id_do_agente_executor);

COMMENT ON TABLE entregaveis IS 'Resultados produzidos pelos agentes especialistas ao completarem uma tarefa.';

ALTER TABLE entregaveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam entregaveis"
  ON entregaveis
  USING (TRUE)
  WITH CHECK (TRUE);

-- Referência reversa em tarefas: facilita encontrar o entregável de uma tarefa
-- sem precisar fazer JOIN em toda consulta
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS id_do_entregavel UUID REFERENCES entregaveis(id) ON DELETE SET NULL;
