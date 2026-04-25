-- ============================================================
-- Agentes Config — DNA de cada agente de IA por organização
-- Vincula cada agente ao seu tenant (organização) via FK
-- ============================================================

CREATE TABLE IF NOT EXISTS agentes_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave estrangeira que conecta o agente ao seu tenant.
  -- CASCADE: se a organização for deletada, seus agentes também são.
  id_da_organizacao     UUID        NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- Nome de batalha do agente. Ex: "Laivinha Orquestradora"
  nome                  TEXT        NOT NULL,

  -- Papel funcional. Ex: "Arquiteta de Soluções"
  papel                 TEXT        NOT NULL,

  -- O prompt completo de personalidade (conteúdo do SOUL.md).
  -- TEXT sem limite de tamanho para acomodar prompts extensos.
  soul_prompt           TEXT        NOT NULL,

  -- Lista de ferramentas habilitadas para o agente.
  -- JSONB permite adicionar/remover ferramentas sem alterar schema.
  -- Ex: ["web_fetch", "image_generate", "supabase_query"]
  ferramentas_habilitadas JSONB     NOT NULL DEFAULT '[]'::jsonb,

  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agentes_config IS 'DNA de cada agente de IA: personalidade, papel e ferramentas, sempre vinculado a uma organização (tenant).';

-- Índice na FK para otimizar buscas por organização
CREATE INDEX IF NOT EXISTS idx_agentes_config_organizacao
  ON agentes_config(id_da_organizacao);

-- Trigger para manter atualizado_em sincronizado
CREATE OR REPLACE FUNCTION update_agentes_config_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agentes_config_atualizado_em
  BEFORE UPDATE ON agentes_config
  FOR EACH ROW
  EXECUTE FUNCTION update_agentes_config_atualizado_em();

-- RLS
ALTER TABLE agentes_config ENABLE ROW LEVEL SECURITY;

-- Admins (service_role) gerenciam; usuários autenticados leem sua org.
CREATE POLICY "Admins gerenciam agentes_config"
  ON agentes_config
  USING (TRUE)
  WITH CHECK (TRUE);
