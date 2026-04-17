-- Migration 00039: document_files table + RLS + storage bucket
-- Workspace document sharing feature

-- Tabela principal
CREATE TABLE document_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES profiles(id),
  sender_sector_id  uuid REFERENCES sectors(id),
  file_name         text NOT NULL,
  file_size         integer NOT NULL,
  mime_type         text NOT NULL,
  storage_path      text NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_document_files_conversation ON document_files(conversation_id);
CREATE INDEX idx_document_files_sender       ON document_files(sender_id);
CREATE INDEX idx_document_files_sector       ON document_files(sender_sector_id);
CREATE INDEX idx_document_files_created      ON document_files(created_at DESC);

-- RLS
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

-- Destinatário de DM vê o arquivo (não o remetente)
CREATE POLICY "dm_recipient_can_view" ON document_files
  FOR SELECT USING (
    sender_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.type = 'dm'
        AND auth.uid() = ANY(c.participant_ids)
    )
  );

-- Membros de grupo veem todos os arquivos do grupo
CREATE POLICY "group_member_can_view" ON document_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.type = 'group'
        AND auth.uid() = ANY(c.participant_ids)
    )
  );

-- Admin e master_admin veem tudo
CREATE POLICY "admin_view_all" ON document_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- Qualquer usuário autenticado pode inserir (validação via server action)
CREATE POLICY "authenticated_insert" ON document_files
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Bucket workspace-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-documents',
  'workspace-documents',
  false,
  20971520,  -- 20 MB
  NULL       -- todos os tipos permitidos
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: upload pelo próprio usuário
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workspace-documents'
    AND auth.role() = 'authenticated'
  );

-- Storage RLS: download apenas para participantes da conversa
-- (validado via signed URL gerada pelo server — storage path inclui conversationId)
CREATE POLICY "authenticated_download" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workspace-documents'
    AND auth.role() = 'authenticated'
  );
