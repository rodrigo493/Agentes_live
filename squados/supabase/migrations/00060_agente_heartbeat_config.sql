-- Migration 00060: Configuração de heartbeat por agente + helpers de cron

-- Colunas de controle por agente
ALTER TABLE agentes_config
  ADD COLUMN IF NOT EXISTS heartbeat_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';

-- Permitir tarefas avulsas (sem workflow)
ALTER TABLE tarefas ALTER COLUMN id_do_workflow DROP NOT NULL;

-- Função pública para listar cron jobs (contorna exposição do schema cron via PostgREST)
CREATE OR REPLACE FUNCTION listar_cron_jobs()
RETURNS TABLE(
  jobid   BIGINT,
  jobname TEXT,
  schedule TEXT,
  active  BOOLEAN
)
SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT jobid, jobname, schedule, active
  FROM cron.job
  ORDER BY jobname;
$$;

-- Função pública para alterar schedule de um job
CREATE OR REPLACE FUNCTION atualizar_cron_schedule(p_job_name TEXT, p_schedule TEXT)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cron.job SET schedule = p_schedule WHERE jobname = p_job_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado', p_job_name;
  END IF;
END;
$$;

-- Função para ativar/pausar um job (pausa = roda às 59:59 de 31 fev, nunca executa)
CREATE OR REPLACE FUNCTION toggle_cron_job(p_job_name TEXT, p_ativo BOOLEAN)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cron.job
  SET schedule = CASE WHEN p_ativo THEN '*/15 * * * *' ELSE '59 23 31 2 *' END
  WHERE jobname = p_job_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado', p_job_name;
  END IF;
END;
$$;
