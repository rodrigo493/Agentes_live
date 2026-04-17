-- Migration 00040: workflow_step_attachments table + RLS + storage bucket

CREATE TABLE workflow_step_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id       uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  file_size     integer NOT NULL,
  mime_type     text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid NOT NULL REFERENCES profiles(id),
  uploaded_at   timestamptz DEFAULT now(),
  decision      text CHECK (decision IN ('seguir', 'nao_seguir')),
  decided_by    uuid REFERENCES profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_wsa_instance ON workflow_step_attachments(instance_id);
CREATE INDEX idx_wsa_step     ON workflow_step_attachments(step_id);

ALTER TABLE workflow_step_attachments ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ver (server actions validam via admin client)
CREATE POLICY "authenticated_select" ON workflow_step_attachments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Uploader insere somente seus próprios registros
CREATE POLICY "authenticated_insert" ON workflow_step_attachments
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Qualquer autenticado pode atualizar decision (validação feita no server action)
CREATE POLICY "authenticated_update_decision" ON workflow_step_attachments
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Bucket workflow-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workflow-attachments',
  'workflow-attachments',
  false,
  20971520,
  NULL
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_upload_wf" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workflow-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "authenticated_download_wf" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workflow-attachments'
    AND auth.role() = 'authenticated'
  );
