-- supabase/migrations/00037_knowledge_image_captions.sql
-- Legendas/descrições para cada imagem, paralelas a image_urls
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS image_captions text[] NOT NULL DEFAULT '{}';
