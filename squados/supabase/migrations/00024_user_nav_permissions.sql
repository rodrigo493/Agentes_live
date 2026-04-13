ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS allowed_nav_items TEXT[] DEFAULT NULL;

COMMENT ON COLUMN profiles.allowed_nav_items IS
  'NULL = padrão [/workspace, /email, /chat, /calendario]. Array = itens permitidos explicitamente.';
