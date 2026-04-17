-- Add category column to knowledge_docs for pesquisa_diaria filtering
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_docs(category)
  WHERE category IS NOT NULL;
