-- ============================================================
-- Workflow Analytics — padrões de bloqueio e atraso
-- Fase 2.3
-- ============================================================

-- View: motivos de bloqueio agregados (últimos 30 dias)
CREATE OR REPLACE VIEW workflow_block_analytics AS
SELECT
  ws.block_reason_code                                AS code,
  COALESCE(wbr.label, ws.block_reason_code)           AS label,
  COALESCE(wbr.category, 'outros')                    AS category,
  s.id                                                AS sector_id,
  s.name                                              AS sector_name,
  COUNT(*)                                            AS occurrences,
  AVG(EXTRACT(EPOCH FROM (COALESCE(ws.completed_at, NOW()) - ws.blocked_at)) / 3600.0)::NUMERIC(10,2) AS avg_hours_blocked,
  MIN(ws.blocked_at)                                  AS first_at,
  MAX(ws.blocked_at)                                  AS last_at
FROM workflow_steps ws
LEFT JOIN workflow_block_reasons wbr ON wbr.code = ws.block_reason_code
LEFT JOIN profiles p                 ON p.id     = ws.assignee_id
LEFT JOIN sectors s                  ON s.id     = p.sector_id
WHERE ws.block_reason_code IS NOT NULL
  AND ws.blocked_at >= NOW() - INTERVAL '30 days'
GROUP BY ws.block_reason_code, wbr.label, wbr.category, s.id, s.name;

GRANT SELECT ON workflow_block_analytics TO authenticated;

-- View: KPIs gerais dos últimos 30 dias
CREATE OR REPLACE VIEW workflow_kpis_30d AS
SELECT
  (SELECT COUNT(*) FROM workflow_instances
    WHERE started_at >= NOW() - INTERVAL '30 days') AS instances_started,
  (SELECT COUNT(*) FROM workflow_instances
    WHERE completed_at >= NOW() - INTERVAL '30 days') AS instances_completed,
  (SELECT COUNT(*) FROM workflow_steps
    WHERE status = 'overdue') AS steps_overdue_now,
  (SELECT COUNT(*) FROM workflow_steps
    WHERE status = 'blocked') AS steps_blocked_now,
  (SELECT COUNT(*) FROM workflow_warnings
    WHERE created_at >= NOW() - INTERVAL '30 days') AS warnings_sent,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600.0)::NUMERIC, 1)
     FROM workflow_steps
    WHERE completed_at IS NOT NULL
      AND completed_at >= NOW() - INTERVAL '30 days') AS avg_step_hours;

GRANT SELECT ON workflow_kpis_30d TO authenticated;
