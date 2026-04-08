-- SquadOS: Refactor memory into 3-layer architecture
-- CAMADA 1: messages (raw) — already exists, unchanged
-- CAMADA 2: processed_memory — new, replaces agent_memory
-- CAMADA 3: knowledge_memory — new, validated knowledge

-- ============================================================
-- Drop old agent_memory table (replaced by 2 new tables)
-- ============================================================
DROP TABLE IF EXISTS agent_memory CASCADE;
DROP TYPE IF EXISTS memory_source_type CASCADE;

-- ============================================================
-- New enums
-- ============================================================
CREATE TYPE memory_source_type AS ENUM (
  'chat_agent', 'workspace_dm', 'workspace_group',
  'knowledge_doc', 'transcript', 'manual_entry'
);

CREATE TYPE memory_processing_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'rejected'
);

CREATE TYPE knowledge_category AS ENUM (
  'procedure', 'policy', 'technical', 'operational',
  'decision', 'lesson_learned', 'faq', 'general'
);

CREATE TYPE knowledge_validation_status AS ENUM (
  'auto_validated', 'human_validated', 'pending_review', 'rejected'
);

CREATE TYPE agent_context_policy AS ENUM (
  'own_user_only',     -- só contexto do próprio usuário
  'group_if_relevant', -- contexto de grupos relevantes ao setor
  'sector_only',       -- contexto completo do setor (default)
  'global_executive'   -- acesso global (CEO, presidente, conselheiros)
);

-- ============================================================
-- CAMADA 2: processed_memory
-- Memória filtrada e organizada, derivada de raw messages
-- ============================================================
CREATE TABLE processed_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_type memory_source_type NOT NULL,
  source_id UUID, -- message.id ou knowledge_doc.id de origem
  content TEXT NOT NULL,
  summary TEXT,
  user_id UUID REFERENCES profiles(id),
  context JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  relevance_score FLOAT NOT NULL DEFAULT 0.5,
  processing_status memory_processing_status NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pmem_sector ON processed_memory(sector_id);
CREATE INDEX idx_pmem_source ON processed_memory(source_type, source_id);
CREATE INDEX idx_pmem_status ON processed_memory(processing_status);
CREATE INDEX idx_pmem_user ON processed_memory(user_id);
CREATE INDEX idx_pmem_tags ON processed_memory USING GIN(tags);
CREATE INDEX idx_pmem_relevance ON processed_memory(relevance_score DESC)
  WHERE is_active = true;

ALTER TABLE processed_memory ENABLE ROW LEVEL SECURITY;

-- System/admin can read processed memory; agents access via service role
CREATE POLICY pmem_select ON processed_memory FOR SELECT USING (
  is_active = true AND (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
  )
);

-- Only system (service role) or admin can insert
CREATE POLICY pmem_insert ON processed_memory FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      role IN ('admin', 'master_admin')
      OR (sector_id = processed_memory.sector_id AND role IN ('manager', 'operator'))
    )
  )
);

CREATE TRIGGER pmem_updated_at
  BEFORE UPDATE ON processed_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CAMADA 3: knowledge_memory
-- Conhecimento validado, principal fonte dos agentes
-- ============================================================
CREATE TABLE knowledge_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_memory_id UUID REFERENCES processed_memory(id), -- rastreabilidade
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category knowledge_category NOT NULL DEFAULT 'general',
  confidence_score FLOAT NOT NULL DEFAULT 0.7,
  validated_by UUID REFERENCES profiles(id),
  validation_status knowledge_validation_status NOT NULL DEFAULT 'auto_validated',
  tags TEXT[] NOT NULL DEFAULT '{}',
  embedding VECTOR(1536),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kmem_sector ON knowledge_memory(sector_id);
CREATE INDEX idx_kmem_category ON knowledge_memory(category);
CREATE INDEX idx_kmem_validation ON knowledge_memory(validation_status);
CREATE INDEX idx_kmem_tags ON knowledge_memory USING GIN(tags);
CREATE INDEX idx_kmem_confidence ON knowledge_memory(confidence_score DESC)
  WHERE is_active = true;
CREATE INDEX idx_kmem_active ON knowledge_memory(sector_id, is_active)
  WHERE is_active = true AND (expires_at IS NULL OR expires_at > now());

ALTER TABLE knowledge_memory ENABLE ROW LEVEL SECURITY;

-- Agents (via service role) and admin can read knowledge_memory
-- context_policy enforcement happens at the application layer (Server Actions)
-- because RLS cannot read the agent's context_policy dynamically
CREATE POLICY kmem_select ON knowledge_memory FOR SELECT USING (
  is_active = true AND (
    expires_at IS NULL OR expires_at > now()
  ) AND (
    -- Admin/master_admin can see all
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
    )
    -- Users can see knowledge from their sector
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND sector_id = knowledge_memory.sector_id
      AND deleted_at IS NULL
    )
  )
);

-- Only system (service role) or admin can insert
CREATE POLICY kmem_insert ON knowledge_memory FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

CREATE POLICY kmem_update ON knowledge_memory FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

CREATE TRIGGER kmem_updated_at
  BEFORE UPDATE ON knowledge_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Add context_policy to agents table
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS
  context_policy agent_context_policy NOT NULL DEFAULT 'sector_only';

-- Update specialist agents to sector_only
UPDATE agents SET context_policy = 'sector_only'
  WHERE type = 'specialist';

-- Update executive agents to global_executive
UPDATE agents SET context_policy = 'global_executive'
  WHERE type IN ('executive', 'governance');
