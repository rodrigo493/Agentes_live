-- ============================================================
-- Migration 00056: Heartbeat dos Agentes Especialistas
-- A cada 15 minutos, verifica tarefas Pendentes com responsável
-- e cujas dependências já estão Concluídas
-- ============================================================

SELECT cron.schedule(
  'heartbeat-especialistas',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lzzdmrlaizfhwqiolmsx.supabase.co/functions/v1/especialista-executor',
    headers:='{"Content-Type": "application/json", "x-api-key": "squad-workflow-api-key-2026"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
