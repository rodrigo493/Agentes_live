-- ============================================================
-- Produção: Processos e Mídias
-- ============================================================

-- Tabela principal de processos
CREATE TABLE IF NOT EXISTS production_processes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT 'violet',
  order_index  INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mídias associadas a cada processo (imagens e vídeos)
CREATE TABLE IF NOT EXISTS production_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id   UUID NOT NULL REFERENCES production_processes(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url          TEXT NOT NULL,
  caption      TEXT,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS production_processes_order_idx ON production_processes(order_index) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS production_media_process_idx ON production_media(process_id);

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE production_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_media ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler processos ativos
CREATE POLICY prod_proc_select ON production_processes
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Apenas admin e master_admin podem criar
CREATE POLICY prod_proc_insert ON production_processes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- Apenas admin e master_admin podem atualizar
CREATE POLICY prod_proc_update ON production_processes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- Mídias: leitura para todos autenticados
CREATE POLICY prod_media_select ON production_media
  FOR SELECT TO authenticated
  USING (true);

-- Mídias: escrita apenas para admin+
CREATE POLICY prod_media_insert ON production_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

CREATE POLICY prod_media_delete ON production_media
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- ── Storage bucket para mídias ─────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'production-media',
  'production-media',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer usuário autenticado pode ler
CREATE POLICY "production_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'production-media');

-- Apenas admin+ pode fazer upload
CREATE POLICY "production_media_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'production-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- Apenas admin+ pode deletar
CREATE POLICY "production_media_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'production-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );
