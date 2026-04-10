-- supabase/migrations/00019_enable_realtime_and_cleanup.sql
-- Habilita Supabase Realtime para messages e conversations.
-- Sem isso, o WorkspaceShell nunca recebe eventos de INSERT e as
-- funcionalidades de notificacao desktop, reordenar conversas e
-- contador de nao-lidas nao funcionam.

DO $$
BEGIN
  -- messages
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION
    WHEN duplicate_object THEN
      -- ja esta na publicacao, tudo bem
      NULL;
  END;

  -- conversations
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;

-- Replica identity FULL para que eventos UPDATE/DELETE tragam a linha completa
-- (messages raramente sofre UPDATE mas conversations sim, ex: last_message_at)
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
