-- ============================================================
-- Workflow Branching — ramificação condicional entre etapas
-- Adiciona branch_options e complete_label ao template_steps,
-- atualiza RPC para suportar destino por título,
-- e insere novas etapas no fluxo Pós-Venda.
-- ============================================================

-- ── Novos campos no template de etapas ──────────────────────
ALTER TABLE workflow_template_steps
  ADD COLUMN IF NOT EXISTS branch_options JSONB,
  ADD COLUMN IF NOT EXISTS complete_label TEXT;

COMMENT ON COLUMN workflow_template_steps.branch_options IS
  'Ramificações disponíveis ao concluir esta etapa. Formato: [{label: "Rótulo", target_title: "Título da etapa destino"}]. NULL = avanço linear automático.';

COMMENT ON COLUMN workflow_template_steps.complete_label IS
  'Rótulo customizado do botão de conclusão quando esta é a etapa final (ex: "Enviado"). NULL = usa "Concluir".';

-- ── RPC atualizado: suporta destino por título (branching) ──
CREATE OR REPLACE FUNCTION complete_workflow_step(
  p_step_id            UUID,
  p_payload            JSONB DEFAULT '{}'::jsonb,
  p_target_step_title  TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step         workflow_steps%ROWTYPE;
  v_next_tmpl    workflow_template_steps%ROWTYPE;
  v_instance     workflow_instances%ROWTYPE;
  v_next_step_id UUID;
  v_assignee     UUID;
BEGIN
  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

  IF v_step.assignee_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin','master_admin')
     )
  THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta etapa';
  END IF;

  -- Conclui a etapa atual
  UPDATE workflow_steps
     SET status       = 'done',
         completed_at = NOW(),
         completed_by = auth.uid(),
         payload_data = COALESCE(p_payload, '{}'::jsonb)
   WHERE id = p_step_id;

  UPDATE workflow_inbox_items
     SET status = 'done', handed_off_at = NOW()
   WHERE workflow_step_id = p_step_id;

  SELECT * INTO v_instance FROM workflow_instances WHERE id = v_step.instance_id;

  -- Busca próxima etapa: por título (branching) ou por step_order+1 (linear)
  IF p_target_step_title IS NOT NULL THEN
    SELECT wts.* INTO v_next_tmpl
      FROM workflow_template_steps wts
     WHERE wts.template_id = v_instance.template_id
       AND wts.title = p_target_step_title
     LIMIT 1;
  ELSE
    SELECT wts.* INTO v_next_tmpl
      FROM workflow_template_steps wts
     WHERE wts.template_id = v_instance.template_id
       AND wts.step_order > v_step.step_order
     ORDER BY wts.step_order ASC LIMIT 1;
  END IF;

  -- Sem próxima etapa → fluxo concluído
  IF v_next_tmpl.id IS NULL THEN
    UPDATE workflow_instances
       SET status = 'completed', completed_at = NOW(), current_step_id = NULL
     WHERE id = v_instance.id;
    RETURN NULL;
  END IF;

  -- Resolve assignee da próxima etapa
  v_assignee := v_next_tmpl.assignee_user_id;
  IF v_assignee IS NULL AND v_next_tmpl.assignee_sector_id IS NOT NULL THEN
    SELECT id INTO v_assignee
      FROM profiles
     WHERE sector_id = v_next_tmpl.assignee_sector_id
       AND status = 'active' AND deleted_at IS NULL
     ORDER BY full_name LIMIT 1;
  END IF;

  -- Cria a próxima etapa de execução
  INSERT INTO workflow_steps (
    instance_id, template_step_id, step_order,
    assignee_id, assignee_sector_id, status,
    started_at, due_at
  ) VALUES (
    v_instance.id, v_next_tmpl.id, v_next_tmpl.step_order,
    v_assignee, v_next_tmpl.assignee_sector_id, 'in_progress',
    NOW(), NOW() + (v_next_tmpl.sla_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_next_step_id;

  UPDATE workflow_instances
     SET current_step_id = v_next_step_id
   WHERE id = v_instance.id;

  RETURN v_next_step_id;
END;
$$;

-- ── Seed: novas etapas + branch_options no template Pós Venda ─
DO $$
DECLARE
  v_template_id        UUID;
  v_next_order         INTEGER;
  v_pos_venda_sec      UUID;
  v_expedicao_sec      UUID;
  v_fallback_assignee  UUID;
BEGIN
  -- Localiza template Pós Venda ativo
  SELECT id INTO v_template_id
    FROM workflow_templates
   WHERE name ILIKE '%Pós Venda%' AND is_active = true
   ORDER BY created_at DESC LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE NOTICE '[00066] Template "Pós Venda" não encontrado — seed ignorado.';
    RETURN;
  END IF;

  -- Setores
  SELECT id INTO v_pos_venda_sec  FROM sectors WHERE slug = 'pos_venda'  LIMIT 1;
  SELECT id INTO v_expedicao_sec  FROM sectors WHERE slug = 'expedicao'  LIMIT 1;

  -- Fallback: qualquer admin caso setores não existam
  IF v_pos_venda_sec IS NULL AND v_expedicao_sec IS NULL THEN
    SELECT id INTO v_fallback_assignee
      FROM profiles WHERE role IN ('admin','master_admin') AND status = 'active'
      ORDER BY full_name LIMIT 1;
  END IF;

  -- ── 1. Separação de Peças Almoxerifado ─────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workflow_template_steps
     WHERE template_id = v_template_id AND title = 'Separação de Peças Almoxerifado'
  ) THEN
    SELECT COALESCE(MAX(step_order), 0) + 1 INTO v_next_order
      FROM workflow_template_steps WHERE template_id = v_template_id;

    INSERT INTO workflow_template_steps (
      template_id, step_order, title, sla_hours,
      assignee_user_id, assignee_sector_id, payload_schema
    ) VALUES (
      v_template_id, v_next_order, 'Separação de Peças Almoxerifado', 24,
      CASE WHEN v_pos_venda_sec IS NULL AND v_expedicao_sec IS NULL THEN v_fallback_assignee ELSE NULL END,
      COALESCE(v_pos_venda_sec, v_expedicao_sec),
      '{}'::jsonb
    );
  END IF;

  -- ── 2. Embalagem Montagem ───────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workflow_template_steps
     WHERE template_id = v_template_id AND title = 'Embalagem Montagem'
  ) THEN
    SELECT COALESCE(MAX(step_order), 0) + 1 INTO v_next_order
      FROM workflow_template_steps WHERE template_id = v_template_id;

    INSERT INTO workflow_template_steps (
      template_id, step_order, title, sla_hours,
      assignee_user_id, assignee_sector_id, payload_schema
    ) VALUES (
      v_template_id, v_next_order, 'Embalagem Montagem', 24,
      CASE WHEN v_pos_venda_sec IS NULL AND v_expedicao_sec IS NULL THEN v_fallback_assignee ELSE NULL END,
      COALESCE(v_expedicao_sec, v_pos_venda_sec),
      '{}'::jsonb
    );
  END IF;

  -- ── 3. Envio de Peças (etapa final) ────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workflow_template_steps
     WHERE template_id = v_template_id AND title = 'Envio de Peças'
  ) THEN
    SELECT COALESCE(MAX(step_order), 0) + 1 INTO v_next_order
      FROM workflow_template_steps WHERE template_id = v_template_id;

    INSERT INTO workflow_template_steps (
      template_id, step_order, title, sla_hours,
      assignee_user_id, assignee_sector_id, payload_schema, complete_label
    ) VALUES (
      v_template_id, v_next_order, 'Envio de Peças', 24,
      CASE WHEN v_pos_venda_sec IS NULL AND v_expedicao_sec IS NULL THEN v_fallback_assignee ELSE NULL END,
      COALESCE(v_expedicao_sec, v_pos_venda_sec),
      '{}'::jsonb,
      'Enviado'
    );
  END IF;

  -- ── Configura branch_options nas etapas existentes ─────────

  -- Emissão de NF → Separação expedição OU Separação almoxerifado
  UPDATE workflow_template_steps
     SET branch_options = '[
       {"label": "Separação de peças expedição", "target_title": "Separação de Peças"},
       {"label": "Separação de peças almoxerifado", "target_title": "Separação de Peças Almoxerifado"}
     ]'::jsonb
   WHERE template_id = v_template_id
     AND title ILIKE '%Emissão%NF%';

  -- Separação de Peças → Expedição OU Embalagem Montagem
  UPDATE workflow_template_steps
     SET branch_options = '[
       {"label": "Expedição", "target_title": "Expedição"},
       {"label": "Embalagem Montagem", "target_title": "Embalagem Montagem"}
     ]'::jsonb
   WHERE template_id = v_template_id
     AND title = 'Separação de Peças';

  -- Separação de Peças Almoxerifado → Expedição OU Embalagem Montagem
  UPDATE workflow_template_steps
     SET branch_options = '[
       {"label": "Expedição", "target_title": "Expedição"},
       {"label": "Embalagem Montagem", "target_title": "Embalagem Montagem"}
     ]'::jsonb
   WHERE template_id = v_template_id
     AND title = 'Separação de Peças Almoxerifado';

  -- Expedição → Envio de Peças (single branch, bypassa etapas paralelas)
  UPDATE workflow_template_steps
     SET branch_options = '[
       {"label": "Envio de Peças", "target_title": "Envio de Peças"}
     ]'::jsonb
   WHERE template_id = v_template_id
     AND title ILIKE '%Expedição%'
     AND (branch_options IS NULL OR branch_options = '[]'::jsonb);

  -- Embalagem Montagem → Envio de Peças
  UPDATE workflow_template_steps
     SET branch_options = '[
       {"label": "Envio de Peças", "target_title": "Envio de Peças"}
     ]'::jsonb
   WHERE template_id = v_template_id
     AND title = 'Embalagem Montagem';

  RAISE NOTICE '[00066] Seed Pós Venda concluído — template_id=%', v_template_id;
END $$;
