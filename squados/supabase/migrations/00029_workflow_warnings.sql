-- ============================================================
-- Workflow Warnings — advertências auditáveis
-- Fase 2.2
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_warnings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id  UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
  instance_id       UUID REFERENCES workflow_instances(id) ON DELETE SET NULL,
  sent_by           UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  sent_to           UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason            TEXT NOT NULL,
  message           TEXT,
  acknowledged_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wf_warn_recipient_idx ON workflow_warnings(sent_to, created_at DESC);
CREATE INDEX IF NOT EXISTS wf_warn_step_idx      ON workflow_warnings(workflow_step_id);

ALTER TABLE workflow_warnings ENABLE ROW LEVEL SECURITY;

-- Leitura: remetente, destinatário ou admin+
CREATE POLICY wf_warn_select ON workflow_warnings
  FOR SELECT TO authenticated USING (
    sent_by = auth.uid()
    OR sent_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- Inserção: apenas master_admin (Presidente)
CREATE POLICY wf_warn_insert ON workflow_warnings
  FOR INSERT WITH CHECK (
    sent_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master_admin')
  );

-- Atualização: destinatário pode marcar como reconhecida
CREATE POLICY wf_warn_update ON workflow_warnings
  FOR UPDATE USING (sent_to = auth.uid());

-- ── RPC: enviar advertência ────────────────────────────────
CREATE OR REPLACE FUNCTION send_workflow_warning(
  p_step_id    UUID,
  p_reason     TEXT,
  p_message    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step        workflow_steps%ROWTYPE;
  v_instance    workflow_instances%ROWTYPE;
  v_warning_id  UUID;
  v_convo_id    UUID;
  v_agent_id    UUID;
  v_ref         TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master_admin') THEN
    RAISE EXCEPTION 'Apenas o Presidente pode enviar advertências';
  END IF;

  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;
  IF v_step.assignee_id IS NULL THEN RAISE EXCEPTION 'Etapa sem responsável'; END IF;

  SELECT * INTO v_instance FROM workflow_instances WHERE id = v_step.instance_id;
  v_ref := COALESCE(v_instance.reference, '');

  INSERT INTO workflow_warnings (
    workflow_step_id, instance_id, sent_by, sent_to, reason, message
  ) VALUES (
    p_step_id, v_step.instance_id, auth.uid(), v_step.assignee_id,
    p_reason, p_message
  ) RETURNING id INTO v_warning_id;

  -- Mensagem no workspace do usuário via orquestrador
  v_convo_id := workflow_get_or_create_orquestrador_convo(v_step.assignee_id);
  IF v_convo_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE name = 'orquestrador' LIMIT 1;
    INSERT INTO messages (conversation_id, sender_id, sender_type, content, content_type, metadata)
    VALUES (
      v_convo_id, NULL, 'agent',
      format('⚠️ ADVERTÊNCIA do Presidente sobre %s' || chr(10) ||
             'Motivo: %s%s',
        v_ref, p_reason,
        CASE WHEN p_message IS NOT NULL THEN chr(10) || p_message ELSE '' END),
      'text',
      jsonb_build_object(
        'kind', 'workflow_warning',
        'warning_id', v_warning_id,
        'workflow_step_id', p_step_id,
        'agent_id', v_agent_id
      )
    );
  END IF;

  RETURN v_warning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_workflow_warning(UUID, TEXT, TEXT) TO authenticated;

-- ── RPC: reconhecer advertência ────────────────────────────
CREATE OR REPLACE FUNCTION acknowledge_workflow_warning(p_warning_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE workflow_warnings
     SET acknowledged_at = NOW()
   WHERE id = p_warning_id AND sent_to = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_workflow_warning(UUID) TO authenticated;
