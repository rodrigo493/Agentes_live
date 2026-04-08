-- ============================================================
-- SquadOS — RLS Policies para authenticated role
-- Execute no Supabase SQL Editor
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: usuarios autenticados podem ler todos os perfis ativos e editar o proprio
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- SECTORS: leitura para todos autenticados
CREATE POLICY "sectors_select" ON sectors FOR SELECT TO authenticated USING (true);

-- AGENTS: leitura para todos autenticados
CREATE POLICY "agents_select" ON agents FOR SELECT TO authenticated USING (true);

-- CONVERSATIONS: ver e criar conversas onde eh participante
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR id IN (SELECT conversation_id FROM group_members WHERE user_id = auth.uid())
);
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR id IN (SELECT conversation_id FROM group_members WHERE user_id = auth.uid())
);

-- MESSAGES: ver mensagens das suas conversas e enviar
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
    UNION
    SELECT conversation_id FROM group_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

-- GROUPS: ver grupos ativos
CREATE POLICY "groups_select" ON groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_insert" ON groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- GROUP_MEMBERS: ver membros dos seus grupos
CREATE POLICY "group_members_select" ON group_members FOR SELECT TO authenticated USING (true);

-- KNOWLEDGE_DOCUMENTS: leitura para autenticados
CREATE POLICY "knowledge_docs_select" ON knowledge_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_docs_insert" ON knowledge_documents FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- PROCESSED_MEMORY: ver memorias das suas conversas
CREATE POLICY "processed_memory_select" ON processed_memory FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "processed_memory_insert" ON processed_memory FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- KNOWLEDGE_MEMORY: leitura para autenticados
CREATE POLICY "knowledge_memory_select" ON knowledge_memory FOR SELECT TO authenticated USING (true);

-- AUDIT_LOGS: ver apenas os proprios logs
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Service role bypassa RLS automaticamente
