-- Migration 00062: Cron job para agentes-monitor (Fase 1 — monitoramento operacional)
-- Executa a edge function agentes-monitor a cada 10 minutos

SELECT cron.schedule(
  'agentes-monitor',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/agentes-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS
'Job agentes-monitor: dispara edge function a cada 10min para detectar overdue/blocked no kanban operacional';
