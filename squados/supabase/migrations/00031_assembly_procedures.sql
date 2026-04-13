-- ============================================================
-- Roteiros de Montagem — aba Roteiros
-- Cada roteiro é espelhado em knowledge_docs para alimentar o RAG
-- dos agentes do setor automaticamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS assembly_procedures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id         UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  procedure_text    TEXT NOT NULL,
  knowledge_doc_id  UUID REFERENCES knowledge_docs(id) ON DELETE SET NULL,
  tags              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assembly_procedure_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id  UUID NOT NULL REFERENCES assembly_procedures(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('image', 'pdf')),
  url           TEXT NOT NULL,
  caption       TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asmb_proc_sector_idx   ON assembly_procedures(sector_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS asmb_proc_tags_idx     ON assembly_procedures USING GIN(tags);
CREATE INDEX IF NOT EXISTS asmb_proc_media_idx    ON assembly_procedure_media(procedure_id, order_index);

-- RLS
ALTER TABLE assembly_procedures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_procedure_media   ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado (conteúdo alimenta agente de qualquer setor)
CREATE POLICY asmb_proc_select ON assembly_procedures
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY asmb_proc_insert ON assembly_procedures
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY asmb_proc_update ON assembly_procedures
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

CREATE POLICY asmb_media_select ON assembly_procedure_media
  FOR SELECT TO authenticated USING (true);
CREATE POLICY asmb_media_insert ON assembly_procedure_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY asmb_media_delete ON assembly_procedure_media
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- Bucket Storage para mídia de roteiros
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'roteiros',
  'roteiros',
  true,
  20971520, -- 20MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read roteiros"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'roteiros');

CREATE POLICY "Admins manage roteiros"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'roteiros'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  )
  WITH CHECK (
    bucket_id = 'roteiros'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- ── Sincronização automática com knowledge_docs (RAG) ───────
-- Cada roteiro ativo mantém um doc espelho em knowledge_docs do setor.
CREATE OR REPLACE FUNCTION sync_assembly_to_knowledge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_content TEXT;
  v_doc_id  UUID;
BEGIN
  v_content := COALESCE(NEW.description, '') || E'\n\n' || NEW.procedure_text;

  IF NEW.knowledge_doc_id IS NULL THEN
    INSERT INTO knowledge_docs (
      sector_id, title, content, doc_type, uploaded_by, tags, metadata, is_active
    ) VALUES (
      NEW.sector_id, NEW.title, v_content, 'procedure',
      COALESCE(NEW.created_by, auth.uid(),
               (SELECT id FROM profiles WHERE role = 'master_admin' LIMIT 1)),
      COALESCE(NEW.tags, ARRAY[]::TEXT[]) || ARRAY['roteiro','montagem'],
      jsonb_build_object('source','assembly_procedure','procedure_id', NEW.id),
      NEW.is_active
    ) RETURNING id INTO v_doc_id;

    NEW.knowledge_doc_id := v_doc_id;
  ELSE
    UPDATE knowledge_docs
       SET title     = NEW.title,
           content   = v_content,
           sector_id = NEW.sector_id,
           tags      = COALESCE(NEW.tags, ARRAY[]::TEXT[]) || ARRAY['roteiro','montagem'],
           is_active = NEW.is_active,
           updated_at = NOW()
     WHERE id = NEW.knowledge_doc_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assembly_before ON assembly_procedures;
CREATE TRIGGER trg_sync_assembly_before
  BEFORE INSERT OR UPDATE OF title, description, procedure_text, sector_id, tags, is_active
  ON assembly_procedures
  FOR EACH ROW EXECUTE FUNCTION sync_assembly_to_knowledge();

-- Updated_at
CREATE OR REPLACE FUNCTION update_assembly_procedures_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asmb_proc_updated ON assembly_procedures;
CREATE TRIGGER trg_asmb_proc_updated
  BEFORE UPDATE ON assembly_procedures
  FOR EACH ROW EXECUTE FUNCTION update_assembly_procedures_updated_at();
