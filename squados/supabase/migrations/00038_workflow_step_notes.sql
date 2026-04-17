-- 00038_workflow_step_notes.sql
-- Adiciona diário de bordo por etapa de instância.
-- Cada entrada: { author_id, author_name, step_title, text, created_at }

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workflow_steps.notes IS
  'Array de anotações acumuladas nesta etapa. Formato: [{author_id, author_name, step_title, text, created_at}]';
