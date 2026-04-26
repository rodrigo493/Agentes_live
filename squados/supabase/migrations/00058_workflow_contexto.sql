-- Migration 00058: Campo de contexto adicional no workflow
-- Armazena respostas e clarificações do Rodrigo para a Orquestradora usar na execução

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS contexto_adicional TEXT;

COMMENT ON COLUMN workflows.contexto_adicional IS
  'Respostas e clarificações do Rodrigo para a Orquestradora usar na execução.';
