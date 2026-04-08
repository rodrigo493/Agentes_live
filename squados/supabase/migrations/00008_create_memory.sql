-- SquadOS: Agent memory (operational memory per sector)
-- Prepared for pgvector embeddings (future RAG)

-- Enable pgvector if available (Supabase has it by default)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_type memory_source_type NOT NULL,
  source_id UUID,
  content TEXT NOT NULL,
  summary TEXT,
  user_id UUID REFERENCES profiles(id),
  context JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  relevance_score FLOAT NOT NULL DEFAULT 0.5,
  embedding VECTOR(1536), -- OpenAI ada-002 / future model
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_sector ON agent_memory(sector_id);
CREATE INDEX idx_memory_source ON agent_memory(source_type, source_id);
CREATE INDEX idx_memory_user ON agent_memory(user_id);
CREATE INDEX idx_memory_tags ON agent_memory USING GIN(tags);
CREATE INDEX idx_memory_active ON agent_memory(is_active) WHERE is_active = true;
-- Future: CREATE INDEX idx_memory_embedding ON agent_memory USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Users see memory from their sector; admins see all
CREATE POLICY memory_select ON agent_memory FOR SELECT USING (
  is_active = true AND (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (
        sector_id = agent_memory.sector_id
        OR role IN ('admin', 'master_admin')
      ) AND deleted_at IS NULL
    )
  )
);

-- System/agents write memory (via service role); managers+ can also write
CREATE POLICY memory_insert ON agent_memory FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      (role IN ('manager', 'admin', 'master_admin'))
      OR (sector_id = agent_memory.sector_id AND role = 'operator')
    ) AND deleted_at IS NULL
  )
);

CREATE TRIGGER memory_updated_at
  BEFORE UPDATE ON agent_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
