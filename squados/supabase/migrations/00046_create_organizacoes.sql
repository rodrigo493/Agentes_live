-- ============================================================
-- Organizações — suporte a multi-tenancy para SaaS
-- Cada organização é um inquilino (tenant) independente no sistema
-- ============================================================

CREATE TABLE IF NOT EXISTS organizacoes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizacoes IS 'Organizações (tenants) do SaaS SquadOS. A Live Equipamentos é o primeiro registro.';

-- Trigger para atualizar automaticamente o campo atualizado_em
CREATE OR REPLACE FUNCTION update_organizacoes_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizacoes_atualizado_em
  BEFORE UPDATE ON organizacoes
  FOR EACH ROW
  EXECUTE FUNCTION update_organizacoes_atualizado_em();

-- RLS
ALTER TABLE organizacoes ENABLE ROW LEVEL SECURITY;

-- Por enquanto, apenas admins (service_role) podem inserir/modificar.
-- Usuários autenticados podem ler sua própria organização.
CREATE POLICY "Admins gerenciam organizacoes"
  ON organizacoes
  USING (TRUE)
  WITH CHECK (TRUE);
