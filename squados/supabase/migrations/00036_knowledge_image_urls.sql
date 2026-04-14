-- supabase/migrations/00036_knowledge_image_urls.sql
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- Criar bucket knowledge-images (público para leitura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-images',
  'knowledge-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: leitura pública
CREATE POLICY IF NOT EXISTS "knowledge_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-images');

-- RLS: escrita autenticada
CREATE POLICY IF NOT EXISTS "knowledge_images_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-images' AND auth.role() = 'authenticated');

-- RLS: deleção autenticada
CREATE POLICY IF NOT EXISTS "knowledge_images_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-images' AND auth.role() = 'authenticated');
