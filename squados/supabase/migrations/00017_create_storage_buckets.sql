-- supabase/migrations/00017_create_storage_buckets.sql

-- Bucket para avatares de usuários (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para imagens de grupos (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-avatars',
  'group-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Leitura pública: avatares
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Upload/update/delete: cada usuário só acessa seu próprio folder
CREATE POLICY "Users manage own avatar"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Leitura pública: group-avatars
CREATE POLICY "Public read group avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'group-avatars');

-- Upload/update/delete group-avatars: somente admin e master_admin
CREATE POLICY "Admins manage group avatars"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'group-avatars'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    bucket_id = 'group-avatars'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );
