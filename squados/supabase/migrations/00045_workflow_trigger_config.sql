-- ============================================================
-- Workflow Trigger Config — item entry modes
-- Fase Kanban: suporte para 3 modos de origem de itens
-- ============================================================

ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS trigger_config jsonb
  NOT NULL DEFAULT '{"type":"manual"}'::jsonb;

COMMENT ON COLUMN workflow_templates.trigger_config IS
  'Configuração de origem dos itens. Ex: {"type":"manual"}, {"type":"webhook","token":"abc"}, {"type":"flow_chain","source_template_id":"uuid","source_step_order":5}';
