-- ============================================================
-- Migration 00065: Horário de Trabalho da Fábrica
-- Fluxos autônomos operam apenas seg–sex, 7:30–17:00 (BRT)
-- ============================================================

-- ── Função auxiliar: verifica se está no horário de operação ─
CREATE OR REPLACE FUNCTION is_horario_trabalho()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_agora  TIMESTAMPTZ;
  v_hora   TIME;
  v_dow    INTEGER; -- 0=domingo, 6=sábado
BEGIN
  v_agora := NOW() AT TIME ZONE 'America/Sao_Paulo';
  v_hora  := v_agora::TIME;
  v_dow   := EXTRACT(DOW FROM v_agora);

  -- Sábado (6) ou domingo (0): não opera
  IF v_dow = 0 OR v_dow = 6 THEN
    RETURN FALSE;
  END IF;

  -- Seg–sex: opera das 7:30 às 17:00
  RETURN v_hora >= '07:30' AND v_hora < '17:00';
END;
$$;

GRANT EXECUTE ON FUNCTION is_horario_trabalho() TO service_role, authenticated, anon;

-- ── Atualiza workflow_mark_overdue_steps para respeitar horário ─
CREATE OR REPLACE FUNCTION workflow_mark_overdue_steps()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Não marca overdue fora do horário de trabalho
  IF NOT is_horario_trabalho() THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE workflow_steps
       SET status = 'overdue'
     WHERE status IN ('pending', 'in_progress')
       AND due_at IS NOT NULL
       AND due_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  -- Espelhar no inbox
  UPDATE workflow_inbox_items
     SET status = 'overdue'
   WHERE status IN ('pending', 'in_progress')
     AND due_at < NOW();

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION workflow_mark_overdue_steps() TO service_role, authenticated;
