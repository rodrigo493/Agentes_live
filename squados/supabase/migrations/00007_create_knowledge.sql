-- SquadOS: Knowledge base documents per sector

CREATE TABLE knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  title TEXT NOT NULL,
  content TEXT,
  doc_type knowledge_doc_type NOT NULL,
  storage_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_sector ON knowledge_docs(sector_id);
CREATE INDEX idx_knowledge_type ON knowledge_docs(doc_type);
CREATE INDEX idx_knowledge_tags ON knowledge_docs USING GIN(tags);
CREATE INDEX idx_knowledge_active ON knowledge_docs(is_active) WHERE is_active = true;

ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;

-- Users can see knowledge from their sector; admins see all
CREATE POLICY knowledge_select ON knowledge_docs FOR SELECT USING (
  is_active = true AND (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (
        sector_id = knowledge_docs.sector_id
        OR role IN ('admin', 'master_admin')
      ) AND deleted_at IS NULL
    )
  )
);

-- Managers of the sector + admins can insert
CREATE POLICY knowledge_insert ON knowledge_docs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      (role = 'manager' AND sector_id = knowledge_docs.sector_id)
      OR role IN ('admin', 'master_admin')
    ) AND deleted_at IS NULL
  )
);

CREATE POLICY knowledge_update ON knowledge_docs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      (role = 'manager' AND sector_id = knowledge_docs.sector_id)
      OR role IN ('admin', 'master_admin')
    ) AND deleted_at IS NULL
  )
);

CREATE TRIGGER knowledge_docs_updated_at
  BEFORE UPDATE ON knowledge_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
