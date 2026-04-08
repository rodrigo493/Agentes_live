-- ============================================================
-- SquadOS — Fix: GRANT permissions for all tables
-- Execute no Supabase SQL Editor
-- ============================================================

-- Service role: full access (usado pelo admin client no backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Authenticated: CRUD nas tabelas (RLS controla o acesso granular)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Anon: apenas leitura em tabelas públicas (RLS controla o acesso)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Garantir que tabelas futuras herdem os GRANTs
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated;

-- ============================================================
-- Criar perfil do admin se não existir
-- ============================================================
INSERT INTO profiles (id, full_name, email, role, status)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  email,
  'master_admin',
  'active'
FROM auth.users
WHERE email = 'rodrigo@liveuni.com.br'
ON CONFLICT (id) DO UPDATE SET
  role = 'master_admin',
  status = 'active';
