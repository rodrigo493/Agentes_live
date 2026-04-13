-- ── Catálogo global de processos ────────────────────────────
CREATE TABLE IF NOT EXISTS process_catalog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id    UUID REFERENCES sectors(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT 'violet',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Mídias do catálogo ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS process_catalog_media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_process_id  UUID NOT NULL REFERENCES process_catalog(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url                 TEXT NOT NULL,
  caption             TEXT,
  order_index         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Atribuições por usuário ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_process_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  catalog_process_id  UUID NOT NULL REFERENCES process_catalog(id) ON DELETE CASCADE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  color               TEXT NOT NULL DEFAULT 'violet',
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, catalog_process_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS process_catalog_sector_idx ON process_catalog(sector_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS process_catalog_media_idx ON process_catalog_media(catalog_process_id);
CREATE INDEX IF NOT EXISTS user_process_assignments_user_idx ON user_process_assignments(user_id);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE process_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_catalog_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_process_assignments ENABLE ROW LEVEL SECURITY;

-- process_catalog: leitura para todos, escrita só admin+
CREATE POLICY proc_cat_select ON process_catalog
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY proc_cat_insert ON process_catalog
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_update ON process_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_delete ON process_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- process_catalog_media: leitura para todos, escrita só admin+
CREATE POLICY proc_cat_media_select ON process_catalog_media
  FOR SELECT TO authenticated USING (true);

CREATE POLICY proc_cat_media_insert ON process_catalog_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_media_delete ON process_catalog_media
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- user_process_assignments: usuário lê os seus, admin lê todos, só admin escreve
CREATE POLICY upa_select ON user_process_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_insert ON user_process_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_delete ON user_process_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_update ON user_process_assignments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- ── Migração de dados existentes ────────────────────────────
-- Migrar production_processes → process_catalog (sem setor)
INSERT INTO process_catalog (id, title, description, color, is_active, created_by, created_at, updated_at)
SELECT id, title, description, color, is_active, created_by, created_at, updated_at
FROM production_processes
WHERE is_active = true
ON CONFLICT (id) DO NOTHING;

-- Migrar production_media → process_catalog_media
INSERT INTO process_catalog_media (id, catalog_process_id, type, url, caption, order_index, created_at)
SELECT id, process_id, type, url, caption, order_index, created_at
FROM production_media
ON CONFLICT (id) DO NOTHING;

-- Migrar vínculos assigned_to → user_process_assignments
INSERT INTO user_process_assignments (user_id, catalog_process_id, order_index, color, created_at)
SELECT assigned_to, id, order_index, color, created_at
FROM production_processes
WHERE is_active = true AND assigned_to IS NOT NULL
ON CONFLICT (user_id, catalog_process_id) DO NOTHING;
