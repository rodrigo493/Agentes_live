-- supabase/migrations/00018_create_user_sectors.sql

-- Tabela de junção: setores permitidos por usuário
CREATE TABLE user_sectors (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sector_id   UUID NOT NULL REFERENCES sectors(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES profiles(id),
  PRIMARY KEY (user_id, sector_id)
);

CREATE INDEX idx_user_sectors_user ON user_sectors(user_id);

ALTER TABLE user_sectors ENABLE ROW LEVEL SECURITY;

-- Usuário lê seus próprios setores; admins leem qualquer um
CREATE POLICY user_sectors_select ON user_sectors FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Somente admin+ pode atribuir setores
CREATE POLICY user_sectors_insert ON user_sectors FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Somente admin+ pode remover setores
CREATE POLICY user_sectors_delete ON user_sectors FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Nova coluna em profiles para o setor ativo agora
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_sector_id UUID REFERENCES sectors(id);

-- Migrar sector_id existente para user_sectors
INSERT INTO user_sectors (user_id, sector_id)
SELECT id, sector_id
FROM profiles
WHERE sector_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Preencher active_sector_id com sector_id existente
UPDATE profiles
SET active_sector_id = sector_id
WHERE sector_id IS NOT NULL AND active_sector_id IS NULL;
