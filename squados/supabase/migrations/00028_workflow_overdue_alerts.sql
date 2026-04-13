-- ============================================================
-- Workflow Overdue Automation + Maestro Alerts Integration
-- Fase 2.1
-- ============================================================

-- ── Função: marca etapas vencidas como overdue ──────────────
CREATE OR REPLACE FUNCTION workflow_mark_overdue_steps()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
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

-- ── Trigger: quando vira overdue/blocked, alerta Presidente ─
CREATE OR REPLACE FUNCTION on_workflow_step_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ref          TEXT;
  v_title        TEXT;
  v_user_name    TEXT;
  v_sector_id    UUID;
  v_sector_name  TEXT;
  v_hours_late   NUMERIC;
  v_content      TEXT;
  v_severity     TEXT;
BEGIN
  IF (TG_OP = 'UPDATE'
      AND OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('overdue', 'blocked'))
  THEN
    SELECT i.reference, COALESCE(i.title, wts.title)
      INTO v_ref, v_title
      FROM workflow_instances i
      JOIN workflow_template_steps wts ON wts.id = NEW.template_step_id
     WHERE i.id = NEW.instance_id;

    SELECT p.full_name, p.sector_id, s.name
      INTO v_user_name, v_sector_id, v_sector_name
      FROM profiles p
 LEFT JOIN sectors s ON s.id = p.sector_id
     WHERE p.id = NEW.assignee_id;

    v_hours_late := EXTRACT(EPOCH FROM (NOW() - COALESCE(NEW.due_at, NOW()))) / 3600.0;

    IF NEW.status = 'overdue' THEN
      v_content  := format('⏰ Fluxo %s atrasado %.1fh (etapa: %s). Responsável: %s.',
                           COALESCE(v_ref,'?'), GREATEST(v_hours_late, 0),
                           COALESCE(v_title,'?'), COALESCE(v_user_name,'sem responsável'));
      v_severity := CASE WHEN v_hours_late >= 24 THEN 'critical' ELSE 'high' END;
    ELSE
      v_content  := format('🚧 Fluxo %s bloqueado por %s. Motivo: %s%s',
                           COALESCE(v_ref,'?'), COALESCE(v_user_name,'?'),
                           COALESCE(NEW.block_reason_code,'(sem código)'),
                           CASE WHEN NEW.block_reason_text IS NOT NULL
                                THEN ' — ' || NEW.block_reason_text ELSE '' END);
      v_severity := 'high';
    END IF;

    INSERT INTO maestro_alerts (
      sector_id, sector_name, user_name, alert_content,
      original_message, severity
    ) VALUES (
      v_sector_id, v_sector_name, v_user_name, v_content,
      format('workflow_step:%s', NEW.id), v_severity
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_step_alert ON workflow_steps;
CREATE TRIGGER trg_workflow_step_alert
  AFTER UPDATE OF status ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION on_workflow_step_alert();

-- ── pg_cron: rodar marcação a cada 5 minutos ────────────────
-- Requer extensão pg_cron ativa no Supabase (Database → Extensions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('workflow-mark-overdue');
    PERFORM cron.schedule(
      'workflow-mark-overdue',
      '*/5 * * * *',
      $cron$ SELECT workflow_mark_overdue_steps(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron não está ativo. Ative em Database → Extensions e rode: SELECT cron.schedule(''workflow-mark-overdue'', ''*/5 * * * *'', ''SELECT workflow_mark_overdue_steps();'');';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível agendar pg_cron: %', SQLERRM;
END;
$$;
