-- ============================================================
-- 00068_workflow_fork — destinos de etapa + fork de fluxo
-- ============================================================

-- ── Colunas de fork no template de etapas ────────────────────
ALTER TABLE workflow_template_steps
  ADD COLUMN IF NOT EXISTS fork_template_id        UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fork_entry_step_order   INT,
  ADD COLUMN IF NOT EXISTS fork_resolve_step_title TEXT;

COMMENT ON COLUMN workflow_template_steps.fork_template_id        IS 'Fluxo alvo do fork. NULL = sem fork.';
COMMENT ON COLUMN workflow_template_steps.fork_entry_step_order   IS 'step_order de entrada no fluxo alvo.';
COMMENT ON COLUMN workflow_template_steps.fork_resolve_step_title IS 'Título da etapa do fluxo fork que, ao ser atingida, desbloqueia o original.';

-- ── Colunas de rastreio no step de execução ──────────────────
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS fork_instance_id UUID REFERENCES workflow_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unblocked_at     TIMESTAMPTZ;

COMMENT ON COLUMN workflow_steps.fork_instance_id IS 'ID da instância fork criada por este step. Usado para rastrear resolução.';
COMMENT ON COLUMN workflow_steps.unblocked_at     IS 'Timestamp do desbloqueio por resolução de fork. Drive da animação LIBERADO na UI.';

-- ── Novo motivo de bloqueio ───────────────────────────────────
INSERT INTO workflow_block_reasons (code, label, category, is_active)
VALUES ('FORK_PENDING', 'Aguardando fluxo paralelo', 'system', true)
ON CONFLICT (code) DO NOTHING;

-- ── RPC atualizado: fork creation + fork resolution ──────────
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
  v_step                    workflow_steps%ROWTYPE;
  v_next_tmpl               workflow_template_steps%ROWTYPE;
  v_instance                workflow_instances%ROWTYPE;
  v_next_step_id            UUID;
  v_assignee                UUID;
  -- fork creation
  v_fork_tmpl_step          workflow_template_steps%ROWTYPE;
  v_fork_instance_id        UUID;
  v_fork_step_id            UUID;
  v_fork_assignee           UUID;
  -- fork resolution
  v_blocked_step_id         UUID;
  v_fork_resolve_title      TEXT;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

  IF (v_step.assignee_id IS DISTINCT FROM auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin','master_admin')
     )
  THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta etapa';
  END IF;

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

    -- Fallback: verifica se este fluxo fork devia resolver um step bloqueado
    SELECT ws.id INTO v_blocked_step_id
      FROM workflow_steps ws
     WHERE ws.fork_instance_id = v_instance.id
       AND ws.status = 'blocked'
       AND ws.block_reason_code = 'FORK_PENDING'
     LIMIT 1
     FOR UPDATE;

    IF v_blocked_step_id IS NOT NULL THEN
      UPDATE workflow_steps
         SET status            = 'in_progress',
             block_reason_code = NULL,
             block_reason_text = NULL,
             blocked_at        = NULL,
             blocked_by        = NULL,
             fork_instance_id  = NULL,
             unblocked_at      = NOW()
       WHERE id = v_blocked_step_id;
    END IF;

    RETURN NULL;
  END IF;

  -- Resolve assignee
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
    NOW(), NOW() + (COALESCE(v_next_tmpl.sla_hours, 24) || ' hours')::INTERVAL
  )
  RETURNING id INTO v_next_step_id;

  UPDATE workflow_instances
     SET current_step_id = v_next_step_id
   WHERE id = v_instance.id;

  -- ── FORK CREATION ──────────────────────────────────────────
  IF v_next_tmpl.fork_template_id IS NOT NULL THEN
    SELECT * INTO v_fork_tmpl_step
      FROM workflow_template_steps
     WHERE template_id = v_next_tmpl.fork_template_id
       AND step_order  = v_next_tmpl.fork_entry_step_order
     LIMIT 1;

    IF v_fork_tmpl_step.id IS NOT NULL THEN
      v_fork_assignee := v_fork_tmpl_step.assignee_user_id;
      IF v_fork_assignee IS NULL AND v_fork_tmpl_step.assignee_sector_id IS NOT NULL THEN
        SELECT id INTO v_fork_assignee
          FROM profiles
         WHERE sector_id = v_fork_tmpl_step.assignee_sector_id
           AND status = 'active' AND deleted_at IS NULL
         ORDER BY full_name LIMIT 1;
      END IF;

      INSERT INTO workflow_instances (template_id, reference, title, status, started_by, metadata)
      VALUES (
        v_next_tmpl.fork_template_id,
        v_instance.reference,
        v_instance.title,
        'running',
        auth.uid(),
        v_instance.metadata
      )
      RETURNING id INTO v_fork_instance_id;

      INSERT INTO workflow_steps (
        instance_id, template_step_id, step_order,
        assignee_id, assignee_sector_id, status,
        started_at, due_at
      ) VALUES (
        v_fork_instance_id, v_fork_tmpl_step.id, v_fork_tmpl_step.step_order,
        v_fork_assignee, v_fork_tmpl_step.assignee_sector_id, 'in_progress',
        NOW(), NOW() + (COALESCE(v_fork_tmpl_step.sla_hours, 24) || ' hours')::INTERVAL
      )
      RETURNING id INTO v_fork_step_id;

      UPDATE workflow_instances
         SET current_step_id = v_fork_step_id
       WHERE id = v_fork_instance_id;

      UPDATE workflow_steps
         SET status            = 'blocked',
             block_reason_code = 'FORK_PENDING',
             blocked_at        = NOW(),
             blocked_by        = auth.uid(),
             fork_instance_id  = v_fork_instance_id
       WHERE id = v_next_step_id;
    ELSE
      RAISE WARNING 'Fork entry step not found: template_id=%, step_order=%. Fork skipped.',
        v_next_tmpl.fork_template_id, v_next_tmpl.fork_entry_step_order;
    END IF;
  END IF;

  -- ── FORK RESOLUTION ────────────────────────────────────────
  SELECT ws.id INTO v_blocked_step_id
    FROM workflow_steps ws
   WHERE ws.fork_instance_id = v_instance.id
     AND ws.status = 'blocked'
     AND ws.block_reason_code = 'FORK_PENDING'
   LIMIT 1
   FOR UPDATE;

  IF v_blocked_step_id IS NOT NULL THEN
    SELECT wts.fork_resolve_step_title INTO v_fork_resolve_title
      FROM workflow_template_steps wts
      JOIN workflow_steps ws_b ON ws_b.template_step_id = wts.id
     WHERE ws_b.id = v_blocked_step_id;

    IF v_fork_resolve_title IS NOT NULL AND v_fork_resolve_title = v_next_tmpl.title THEN
      UPDATE workflow_steps
         SET status            = 'in_progress',
             block_reason_code = NULL,
             block_reason_text = NULL,
             blocked_at        = NULL,
             blocked_by        = NULL,
             fork_instance_id  = NULL,
             unblocked_at      = NOW()
       WHERE id = v_blocked_step_id;

      UPDATE workflow_instances
         SET status = 'completed', completed_at = NOW(), current_step_id = NULL
       WHERE id = v_instance.id;
    END IF;
  END IF;

  RETURN v_next_step_id;
END;
$$;

-- Indexes for fork FK columns
CREATE INDEX IF NOT EXISTS wf_tmpl_steps_fork_tmpl_idx ON workflow_template_steps(fork_template_id) WHERE fork_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wf_steps_fork_instance_idx  ON workflow_steps(fork_instance_id) WHERE fork_instance_id IS NOT NULL;

GRANT EXECUTE ON FUNCTION complete_workflow_step(UUID, JSONB, TEXT) TO authenticated;
