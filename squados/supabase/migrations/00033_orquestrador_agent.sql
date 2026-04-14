-- squados/supabase/migrations/00033_orquestrador_agent.sql
-- Garante existência do agente orquestrador referenciado pelas funções de workflow

INSERT INTO agents (
  name,
  display_name,
  type,
  access_level,
  description,
  config,
  sector_id
)
SELECT
  'orquestrador',
  'Orquestrador',
  'executive',
  'global',
  'Agente orquestrador de workflows — recebe notificações de etapas, atrasos e advertências.',
  '{}'::jsonb,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'orquestrador');
