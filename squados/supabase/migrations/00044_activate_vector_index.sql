-- supabase/migrations/00044_activate_vector_index.sql

-- Garante extensão ativa
CREATE EXTENSION IF NOT EXISTS vector;

-- IVFFlat index para cosine similarity em knowledge_docs
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding
  ON knowledge_docs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Função RPC para busca semântica
CREATE OR REPLACE FUNCTION match_knowledge_docs(
  query_embedding vector(1536),
  match_sector_id uuid,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  doc_type text,
  category text,
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kd.id,
    kd.title,
    kd.content,
    kd.doc_type,
    kd.category,
    kd.tags,
    1 - (kd.embedding <=> query_embedding) AS similarity
  FROM knowledge_docs kd
  WHERE
    kd.is_active = true
    AND kd.sector_id = match_sector_id
    AND kd.embedding IS NOT NULL
    AND 1 - (kd.embedding <=> query_embedding) >= match_threshold
  ORDER BY kd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
