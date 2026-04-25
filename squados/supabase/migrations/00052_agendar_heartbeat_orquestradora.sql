-- ============================================================
-- Migration 00052: Heartbeat da Orquestradora
-- pg_cron dispara a Edge Function a cada 15 minutos
-- pg_net executa a chamada HTTP de dentro do banco
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;

SELECT cron.schedule(
  'heartbeat-orquestradora',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lzzdmrlaizfhwqiolmsx.supabase.co/functions/v1/orquestradora-planner',
    headers:='{"Content-Type": "application/json", "x-api-key": "squad-workflow-api-key-2026"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
