-- ============================================================
-- SquadOS — Setup Completo do Banco de Dados
-- Execute no Supabase SQL Editor (em uma única execução)
-- Versão: 1.0.0 com memória em 3 camadas
-- ============================================================

-- ============================================================
-- 1. EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM (
  'master_admin', 'admin', 'manager', 'operator', 'viewer'
);

CREATE TYPE user_status AS ENUM (
  'active', 'inactive', 'suspended'
);

CREATE TYPE conversation_type AS ENUM ('agent', 'dm', 'group');

CREATE TYPE message_sender_type AS ENUM ('user', 'agent', 'system');

CREATE TYPE message_content_type AS ENUM ('text', 'system', 'file', 'image');

CREATE TYPE group_status AS ENUM ('active', 'archived');

CREATE TYPE group_member_role AS ENUM ('admin', 'member');

CREATE TYPE knowledge_doc_type AS ENUM (
  'transcript', 'document', 'procedure', 'manual', 'note', 'other'
);

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

CREATE TYPE agent_type AS ENUM ('specialist', 'executive', 'governance');

CREATE TYPE agent_access_level AS ENUM ('sector', 'multi_sector', 'global');

CREATE TYPE agent_context_policy AS ENUM (
  'own_user_only', 'group_if_relevant', 'sector_only', 'global_executive'
);

CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'draft');

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'login', 'logout',
  'access_denied', 'permission_change', 'role_change',
  'group_create', 'group_member_add', 'group_member_remove',
  'content_upload', 'content_delete', 'export'
);

CREATE TYPE audit_status AS ENUM ('success', 'failure', 'denied');

CREATE TYPE permission_level AS ENUM ('read', 'write', 'manage', 'admin');

-- ============================================================
-- 3. FUNÇÕES UTILITÁRIAS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. TABELAS (ordem de dependência correta)
-- ============================================================

-- 4.1 sectors (sem FK para agents por enquanto)
CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  area TEXT,
  icon TEXT,
  agent_id UUID, -- FK adicionada após criação de agents
  parent_sector_id UUID REFERENCES sectors(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sectors_slug ON sectors(slug);
CREATE INDEX idx_sectors_area ON sectors(area);

-- 4.2 profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'operator',
  sector_id UUID REFERENCES sectors(id),
  status user_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  phone TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_sector ON profiles(sector_id);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_email ON profiles(email);

-- 4.3 agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  type agent_type NOT NULL,
  sector_id UUID REFERENCES sectors(id),
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  system_prompt TEXT,
  access_level agent_access_level NOT NULL DEFAULT 'sector',
  context_policy agent_context_policy NOT NULL DEFAULT 'sector_only',
  status agent_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agents_sector ON agents(sector_id);
CREATE INDEX idx_agents_type ON agents(type);

-- Add FK from sectors to agents
ALTER TABLE sectors ADD CONSTRAINT fk_sectors_agent
  FOREIGN KEY (agent_id) REFERENCES agents(id);

-- 4.4 groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sector_id UUID REFERENCES sectors(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  avatar_url TEXT,
  status group_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_sector ON groups(sector_id);
CREATE INDEX idx_groups_status ON groups(status);

-- 4.5 group_members
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role group_member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES profiles(id),
  UNIQUE(group_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);

-- 4.6 conversations (CAMADA 1: referências para raw messages)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL,
  sector_id UUID REFERENCES sectors(id),
  group_id UUID REFERENCES groups(id),
  participant_ids UUID[] NOT NULL DEFAULT '{}',
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_sector ON conversations(sector_id);
CREATE INDEX idx_conversations_group ON conversations(group_id);
CREATE INDEX idx_conversations_participants ON conversations USING GIN(participant_ids);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- 4.7 messages (CAMADA 1: RAW — agentes NUNCA acessam diretamente)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  sender_type message_sender_type NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  metadata JSONB NOT NULL DEFAULT '{}',
  reply_to_id UUID REFERENCES messages(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- 4.8 knowledge_docs (documentos originais ingeridos)
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

-- 4.9 processed_memory (CAMADA 2: memória filtrada e organizada)
CREATE TABLE processed_memory (
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
CREATE INDEX idx_pmem_relevance ON processed_memory(relevance_score DESC) WHERE is_active = true;

-- 4.10 knowledge_memory (CAMADA 3: conhecimento validado — FONTE PRINCIPAL dos agentes)
CREATE TABLE knowledge_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_memory_id UUID REFERENCES processed_memory(id),
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
CREATE INDEX idx_kmem_confidence ON knowledge_memory(confidence_score DESC) WHERE is_active = true;
-- Índice simples (filtro por expires_at feito na query, não no índice — now() não é IMMUTABLE)
CREATE INDEX idx_kmem_active ON knowledge_memory(sector_id, is_active, expires_at)
  WHERE is_active = true;

-- 4.11 audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action audit_action NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  status audit_status NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- 4.12 user_permissions
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  permission permission_level NOT NULL,
  granted_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, resource_type, resource_id, permission)
);
CREATE INDEX idx_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_permissions_resource ON user_permissions(resource_type, resource_id);

-- ============================================================
-- 5. TRIGGERS
-- ============================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sectors_updated_at
  BEFORE UPDATE ON sectors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

CREATE TRIGGER knowledge_docs_updated_at
  BEFORE UPDATE ON knowledge_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pmem_updated_at
  BEFORE UPDATE ON processed_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER kmem_updated_at
  BEFORE UPDATE ON knowledge_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. ROW LEVEL SECURITY — TODAS AS TABELAS
-- ============================================================

-- sectors
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY sectors_select ON sectors FOR SELECT USING (is_active = true);
CREATE POLICY sectors_insert ON sectors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY sectors_update ON sectors FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  deleted_at IS NULL AND (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'master_admin') AND p.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.sector_id = profiles.sector_id AND p.deleted_at IS NULL)
    OR (status = 'active')
  )
);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  OR id = auth.uid()
);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY agents_select ON agents FOR SELECT USING (status = 'active');
CREATE POLICY agents_insert ON agents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY agents_update ON agents FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- groups
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_select ON groups FOR SELECT USING (
  status = 'active' AND (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  )
);
CREATE POLICY groups_insert ON groups FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY groups_update ON groups FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- group_members
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_select ON group_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY group_members_insert ON group_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY group_members_delete ON group_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  auth.uid() = ANY(participant_ids)
  OR EXISTS (SELECT 1 FROM group_members WHERE group_id = conversations.group_id AND user_id = auth.uid())
  OR (type = 'agent' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = conversations.sector_id))
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (
  auth.uid() = ANY(participant_ids)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (
  auth.uid() = ANY(participant_ids)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- messages (CAMADA 1 — raw, agentes nunca acessam diretamente)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (
      auth.uid() = ANY(c.participant_ids)
      OR EXISTS (SELECT 1 FROM group_members WHERE group_id = c.group_id AND user_id = auth.uid())
      OR (c.type = 'agent' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = c.sector_id))
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    )
  )
);
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (
      auth.uid() = ANY(c.participant_ids)
      OR EXISTS (SELECT 1 FROM group_members WHERE group_id = c.group_id AND user_id = auth.uid())
      OR (c.type = 'agent' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = c.sector_id))
    )
  )
);

-- knowledge_docs
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_select ON knowledge_docs FOR SELECT USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      sector_id = knowledge_docs.sector_id OR role IN ('admin', 'master_admin')
    ) AND deleted_at IS NULL
  )
);
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

-- processed_memory (CAMADA 2 — somente admin e sistema)
ALTER TABLE processed_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY pmem_select ON processed_memory FOR SELECT USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);
CREATE POLICY pmem_insert ON processed_memory FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND (
      role IN ('admin', 'master_admin')
      OR (sector_id = processed_memory.sector_id AND role IN ('manager', 'operator'))
    )
  )
);

-- knowledge_memory (CAMADA 3 — agentes leem via service role; users do setor leem)
ALTER TABLE knowledge_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY kmem_select ON knowledge_memory FOR SELECT USING (
  is_active = true AND (expires_at IS NULL OR expires_at > now()) AND (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND sector_id = knowledge_memory.sector_id AND deleted_at IS NULL)
  )
);
CREATE POLICY kmem_insert ON knowledge_memory FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY kmem_update ON knowledge_memory FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);

-- user_permissions
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissions_select ON user_permissions FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY permissions_insert ON user_permissions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY permissions_update ON user_permissions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
CREATE POLICY permissions_delete ON user_permissions FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- ============================================================
-- 7. REALTIME — habilitar para mensagens e presença
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- ============================================================
-- 8. SEED — 17 setores + 24 agentes (17 especialistas + 7 executivos)
-- ============================================================

-- Agentes especialistas
INSERT INTO agents (name, display_name, type, context_policy, description, access_level, status) VALUES
  ('agente_solda', 'Agente Solda', 'specialist', 'sector_only', 'Agente especialista do setor de soldagem', 'sector', 'draft'),
  ('agente_inspecao_qualidade_solda', 'Agente Inspeção Qualidade Solda', 'specialist', 'sector_only', 'Agente de inspeção de qualidade da solda', 'sector', 'draft'),
  ('agente_lavagem', 'Agente Lavagem', 'specialist', 'sector_only', 'Agente especialista do setor de lavagem', 'sector', 'draft'),
  ('agente_pintura', 'Agente Pintura', 'specialist', 'sector_only', 'Agente especialista do setor de pintura', 'sector', 'draft'),
  ('agente_inspecao_qualidade_pintura', 'Agente Inspeção Qualidade Pintura', 'specialist', 'sector_only', 'Agente de inspeção de qualidade da pintura', 'sector', 'draft'),
  ('agente_montagem', 'Agente Montagem', 'specialist', 'sector_only', 'Agente especialista do setor de montagem', 'sector', 'draft'),
  ('agente_expedicao', 'Agente Expedição', 'specialist', 'sector_only', 'Agente especialista do setor de expedição', 'sector', 'draft'),
  ('agente_compras', 'Agente Compras', 'specialist', 'sector_only', 'Agente especialista do setor de compras', 'sector', 'draft'),
  ('agente_comercial', 'Agente Comercial', 'specialist', 'sector_only', 'Agente especialista do setor comercial', 'sector', 'draft'),
  ('agente_marketing', 'Agente Marketing', 'specialist', 'sector_only', 'Agente especialista do setor de marketing', 'sector', 'draft'),
  ('agente_financeiro', 'Agente Financeiro', 'specialist', 'sector_only', 'Agente especialista do setor financeiro', 'sector', 'draft'),
  ('agente_contabil', 'Agente Contábil', 'specialist', 'sector_only', 'Agente especialista do setor contábil', 'sector', 'draft'),
  ('agente_administrativo', 'Agente Administrativo', 'specialist', 'sector_only', 'Agente especialista do setor administrativo', 'sector', 'draft'),
  ('agente_rh', 'Agente RH', 'specialist', 'sector_only', 'Agente especialista de recursos humanos', 'sector', 'draft'),
  ('agente_pos_venda', 'Agente Pós-venda', 'specialist', 'sector_only', 'Agente especialista de pós-venda', 'sector', 'draft'),
  ('agente_assistencia_tecnica', 'Agente Assistência Técnica', 'specialist', 'sector_only', 'Agente de assistência técnica', 'sector', 'draft'),
  ('agente_engenharia', 'Agente Engenharia', 'specialist', 'sector_only', 'Agente especialista de engenharia', 'sector', 'draft');

-- Agentes executivos
INSERT INTO agents (name, display_name, type, context_policy, description, access_level, status) VALUES
  ('agente_ceo', 'Agente CEO', 'executive', 'global_executive', 'Agente executivo com visão consolidada total', 'global', 'draft'),
  ('agente_presidente', 'Agente Presidente', 'executive', 'global_executive', 'Agente executivo do presidente', 'global', 'draft'),
  ('conselheiro_administrativo', 'Conselheiro Administrativo', 'executive', 'global_executive', 'Conselheiro para análise administrativa', 'global', 'draft'),
  ('conselheiro_de_processos', 'Conselheiro de Processos', 'executive', 'global_executive', 'Conselheiro para análise de processos', 'global', 'draft'),
  ('conselheiro_financeiro', 'Conselheiro Financeiro', 'executive', 'global_executive', 'Conselheiro para análise financeira', 'global', 'draft'),
  ('conselheiro_estrategico', 'Conselheiro Estratégico', 'executive', 'global_executive', 'Conselheiro para análise estratégica', 'global', 'draft'),
  ('agente_governanca', 'Agente Governança', 'governance', 'global_executive', 'Agente de governança e alinhamento', 'global', 'draft');

-- 17 setores vinculados aos agentes
INSERT INTO sectors (name, slug, description, area, icon, agent_id) VALUES
  ('Solda', 'solda', 'Setor de soldagem', 'Produção', '🔥', (SELECT id FROM agents WHERE name = 'agente_solda')),
  ('Inspeção de Qualidade - Solda', 'inspecao_qualidade_solda', 'Inspeção e controle de qualidade da solda', 'Qualidade', '🔍', (SELECT id FROM agents WHERE name = 'agente_inspecao_qualidade_solda')),
  ('Lavagem', 'lavagem', 'Setor de lavagem de peças', 'Produção', '💧', (SELECT id FROM agents WHERE name = 'agente_lavagem')),
  ('Pintura', 'pintura', 'Setor de pintura', 'Produção', '🎨', (SELECT id FROM agents WHERE name = 'agente_pintura')),
  ('Inspeção de Qualidade - Pintura', 'inspecao_qualidade_pintura', 'Inspeção e controle de qualidade da pintura', 'Qualidade', '🔎', (SELECT id FROM agents WHERE name = 'agente_inspecao_qualidade_pintura')),
  ('Montagem', 'montagem', 'Setor de montagem final', 'Produção', '🔧', (SELECT id FROM agents WHERE name = 'agente_montagem')),
  ('Expedição', 'expedicao', 'Setor de expedição e logística', 'Logística', '📦', (SELECT id FROM agents WHERE name = 'agente_expedicao')),
  ('Compras', 'compras', 'Setor de compras e suprimentos', 'Suprimentos', '🛒', (SELECT id FROM agents WHERE name = 'agente_compras')),
  ('Comercial', 'comercial', 'Setor comercial e vendas', 'Comercial', '💼', (SELECT id FROM agents WHERE name = 'agente_comercial')),
  ('Marketing', 'marketing', 'Setor de marketing e comunicação', 'Marketing', '📢', (SELECT id FROM agents WHERE name = 'agente_marketing')),
  ('Financeiro', 'financeiro', 'Setor financeiro', 'Financeiro', '💰', (SELECT id FROM agents WHERE name = 'agente_financeiro')),
  ('Contábil', 'contabil', 'Setor de contabilidade', 'Financeiro', '📊', (SELECT id FROM agents WHERE name = 'agente_contabil')),
  ('Administrativo', 'administrativo', 'Setor administrativo', 'Administrativo', '🏢', (SELECT id FROM agents WHERE name = 'agente_administrativo')),
  ('RH', 'rh', 'Recursos humanos', 'RH', '👥', (SELECT id FROM agents WHERE name = 'agente_rh')),
  ('Pós-venda', 'pos_venda', 'Setor de pós-venda e relacionamento', 'Pós-venda', '🤝', (SELECT id FROM agents WHERE name = 'agente_pos_venda')),
  ('Assistência Técnica', 'assistencia_tecnica', 'Assistência técnica e suporte', 'Suporte', '🛠️', (SELECT id FROM agents WHERE name = 'agente_assistencia_tecnica')),
  ('Engenharia', 'engenharia', 'Setor de engenharia e projetos', 'Engenharia', '⚙️', (SELECT id FROM agents WHERE name = 'agente_engenharia'));

-- Link agents back to their sectors
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'solda') WHERE name = 'agente_solda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'inspecao_qualidade_solda') WHERE name = 'agente_inspecao_qualidade_solda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'lavagem') WHERE name = 'agente_lavagem';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'pintura') WHERE name = 'agente_pintura';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'inspecao_qualidade_pintura') WHERE name = 'agente_inspecao_qualidade_pintura';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'montagem') WHERE name = 'agente_montagem';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'expedicao') WHERE name = 'agente_expedicao';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'compras') WHERE name = 'agente_compras';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'comercial') WHERE name = 'agente_comercial';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'marketing') WHERE name = 'agente_marketing';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'financeiro') WHERE name = 'agente_financeiro';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'contabil') WHERE name = 'agente_contabil';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'administrativo') WHERE name = 'agente_administrativo';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'rh') WHERE name = 'agente_rh';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'pos_venda') WHERE name = 'agente_pos_venda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'assistencia_tecnica') WHERE name = 'agente_assistencia_tecnica';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'engenharia') WHERE name = 'agente_engenharia';

-- ============================================================
-- 9. GRANTS (permissões para roles do Supabase)
-- ============================================================

-- Service role: acesso total (backend admin client)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Authenticated: CRUD (RLS controla acesso granular)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Anon: leitura (RLS controla acesso)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Herança para tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated;

-- ============================================================
-- SETUP COMPLETO!
-- Próximos passos:
-- 1. Criar primeiro usuário via Supabase Auth Dashboard
-- 2. O perfil será criado automaticamente pelo trigger handle_new_user()
-- 3. Promover para master_admin:
--    UPDATE profiles SET role = 'master_admin' WHERE email = 'seu@email.com';
-- ============================================================
