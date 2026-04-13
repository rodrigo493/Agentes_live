-- ============================================================
-- Workflow Inbox + Triggers + RPC Functions
-- ============================================================

-- ── Inbox visual (aba Produção → Caixa de Entrada) ──────────
CREATE TABLE IF NOT EXISTS workflow_inbox_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workflow_step_id   UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  instance_id        UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  reference          TEXT,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at             TIMESTAMPTZ NOT NULL,
  handoff_target_at  TIMESTAMPTZ NOT NULL,
  handed_off_at      TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','in_progress','done','blocked','overdue')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_step_id)
);

CREATE INDEX IF NOT EXISTS wf_inbox_user_idx   ON workflow_inbox_items(user_id, status);
CREATE INDEX IF NOT EXISTS wf_inbox_due_idx    ON workflow_inbox_items(due_at) WHERE status IN ('pending','in_progress');

ALTER TABLE workflow_inbox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY wf_inbox_select ON workflow_inbox_items
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
CREATE POLICY wf_inbox_update ON workflow_inbox_items
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- ── Helper: buscar ou criar conversa "agent" orquestrador ↔ user ─
CREATE OR REPLACE FUNCTION workflow_get_or_create_orquestrador_convo(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID;
  v_convo_id UUID;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE name = 'orquestrador' LIMIT 1;
  IF v_agent_id IS NULL THEN
    RETURN NULL; -- Orquestrador não cadastrado; trigger seguirá sem mensagem
  END IF;

  SELECT id INTO v_convo_id
  FROM conversations
  WHERE type = 'agent'
    AND p_user_id = ANY(participant_ids)
    AND (metadata->>'agent_id')::UUID = v_agent_id
  LIMIT 1;

  IF v_convo_id IS NULL THEN
    INSERT INTO conversations (type, participant_ids, title, metadata)
    VALUES ('agent', ARRAY[p_user_id]::UUID[], 'Orquestrador',
            jsonb_build_object('agent_id', v_agent_id, 'source', 'workflow'))
    RETURNING id INTO v_convo_id;
  END IF;

  RETURN v_convo_id;
END;
$$;

-- ── Trigger: quando etapa é ativada, cria inbox + mensagem ──
CREATE OR REPLACE FUNCTION on_workflow_step_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title       TEXT;
  v_reference   TEXT;
  v_convo_id    UUID;
  v_agent_id    UUID;
BEGIN
  IF NEW.status = 'in_progress'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.assignee_id IS NOT NULL
  THEN
    SELECT wi.reference, wi.reference || COALESCE(' — ' || wts.title, '')
      INTO v_reference, v_title
      FROM workflow_instances wi
      JOIN workflow_template_steps wts ON wts.id = NEW.template_step_id
     WHERE wi.id = NEW.instance_id;

    INSERT INTO workflow_inbox_items (
      user_id, workflow_step_id, instance_id, title, reference,
      received_at, due_at, handoff_target_at, status
    ) VALUES (
      NEW.assignee_id, NEW.id, NEW.instance_id, v_title, v_reference,
      COALESCE(NEW.started_at, NOW()), NEW.due_at, NEW.due_at, 'in_progress'
    )
    ON CONFLICT (workflow_step_id) DO NOTHING;

    -- Mensagem do orquestrador (opcional — só se agente existir)
    v_convo_id := workflow_get_or_create_orquestrador_convo(NEW.assignee_id);
    IF v_convo_id IS NOT NULL THEN
      SELECT id INTO v_agent_id FROM agents WHERE name = 'orquestrador' LIMIT 1;
      INSERT INTO messages (conversation_id, sender_id, sender_type, content, content_type, metadata)
      VALUES (
        v_convo_id, NULL, 'agent',
        format('📥 Nova tarefa: %s' || chr(10) ||
               'Recebida: %s' || chr(10) ||
               'Prazo: %s',
          v_title,
          to_char(COALESCE(NEW.started_at, NOW()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
          to_char(NEW.due_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        ),
        'text',
        jsonb_build_object(
          'kind', 'workflow_new_task',
          'workflow_step_id', NEW.id,
          'instance_id', NEW.instance_id,
          'agent_id', v_agent_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_step_activated ON workflow_steps;
CREATE TRIGGER trg_workflow_step_activated
  AFTER INSERT OR UPDATE OF status ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION on_workflow_step_activated();

-- ── RPC: iniciar instância de workflow ─────────────────────
CREATE OR REPLACE FUNCTION start_workflow_instance(
  p_template_id UUID,
  p_reference   TEXT,
  p_title       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance_id UUID;
  v_first_step  workflow_template_steps%ROWTYPE;
  v_assignee    UUID;
  v_step_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  INSERT INTO workflow_instances (template_id, reference, title, started_by)
  VALUES (p_template_id, p_reference, p_title, auth.uid())
  RETURNING id INTO v_instance_id;

  SELECT * INTO v_first_step
    FROM workflow_template_steps
   WHERE template_id = p_template_id
   ORDER BY step_order ASC
   LIMIT 1;

  IF v_first_step.id IS NULL THEN
    RAISE EXCEPTION 'Template sem etapas';
  END IF;

  v_assignee := v_first_step.assignee_user_id;
  IF v_assignee IS NULL AND v_first_step.assignee_sector_id IS NOT NULL THEN
    SELECT id INTO v_assignee
      FROM profiles
     WHERE sector_id = v_first_step.assignee_sector_id
       AND status = 'active' AND deleted_at IS NULL
     ORDER BY full_name LIMIT 1;
  END IF;

  INSERT INTO workflow_steps (
    instance_id, template_step_id, step_order,
    assignee_id, assignee_sector_id, status,
    started_at, due_at
  ) VALUES (
    v_instance_id, v_first_step.id, v_first_step.step_order,
    v_assignee, v_first_step.assignee_sector_id, 'in_progress',
    NOW(), NOW() + (v_first_step.sla_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_step_id;

  UPDATE workflow_instances SET current_step_id = v_step_id WHERE id = v_instance_id;

  RETURN v_instance_id;
END;
$$;

-- ── RPC: concluir etapa e ativar próxima ───────────────────
CREATE OR REPLACE FUNCTION complete_workflow_step(
  p_step_id  UUID,
  p_payload  JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step       workflow_steps%ROWTYPE;
  v_next_tmpl  workflow_template_steps%ROWTYPE;
  v_instance   workflow_instances%ROWTYPE;
  v_next_step_id UUID;
  v_assignee   UUID;
BEGIN
  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;
  IF v_step.assignee_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta etapa';
  END IF;

  UPDATE workflow_steps
     SET status = 'done',
         completed_at = NOW(),
         completed_by = auth.uid(),
         payload_data = COALESCE(p_payload, '{}'::jsonb)
   WHERE id = p_step_id;

  UPDATE workflow_inbox_items
     SET status = 'done', handed_off_at = NOW()
   WHERE workflow_step_id = p_step_id;

  SELECT * INTO v_instance FROM workflow_instances WHERE id = v_step.instance_id;

  -- Buscar próxima etapa do template
  SELECT wts.* INTO v_next_tmpl
    FROM workflow_template_steps wts
   WHERE wts.template_id = v_instance.template_id
     AND wts.step_order > v_step.step_order
   ORDER BY wts.step_order ASC LIMIT 1;

  IF v_next_tmpl.id IS NULL THEN
    UPDATE workflow_instances
       SET status = 'completed', completed_at = NOW(), current_step_id = NULL
     WHERE id = v_instance.id;
    RETURN NULL;
  END IF;

  v_assignee := v_next_tmpl.assignee_user_id;
  IF v_assignee IS NULL AND v_next_tmpl.assignee_sector_id IS NOT NULL THEN
    SELECT id INTO v_assignee
      FROM profiles
     WHERE sector_id = v_next_tmpl.assignee_sector_id
       AND status = 'active' AND deleted_at IS NULL
     ORDER BY full_name LIMIT 1;
  END IF;

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

  UPDATE workflow_instances SET current_step_id = v_next_step_id WHERE id = v_instance.id;

  RETURN v_next_step_id;
END;
$$;

-- ── RPC: bloquear etapa com motivo ─────────────────────────
CREATE OR REPLACE FUNCTION block_workflow_step(
  p_step_id      UUID,
  p_reason_code  TEXT,
  p_reason_text  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_step workflow_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;
  IF v_step.assignee_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  THEN
    RAISE EXCEPTION 'Sem permissão para bloquear esta etapa';
  END IF;

  UPDATE workflow_steps
     SET status = 'blocked',
         block_reason_code = p_reason_code,
         block_reason_text = p_reason_text,
         blocked_at = NOW(),
         blocked_by = auth.uid()
   WHERE id = p_step_id;

  UPDATE workflow_inbox_items
     SET status = 'blocked'
   WHERE workflow_step_id = p_step_id;
END;
$$;

GRANT EXECUTE ON FUNCTION start_workflow_instance(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_workflow_step(UUID,JSONB)       TO authenticated;
GRANT EXECUTE ON FUNCTION block_workflow_step(UUID,TEXT,TEXT)      TO authenticated;
