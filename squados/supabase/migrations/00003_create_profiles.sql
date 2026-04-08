-- SquadOS: User profiles (extends auth.users)

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'operator',
  sector_id UUID REFERENCES sectors(id),
  status user_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  phone TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_sector ON profiles(sector_id);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_email ON profiles(email);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can see their own profile
-- Managers can see profiles in their sector
-- Admins can see all profiles
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  deleted_at IS NULL AND (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'master_admin')
      AND p.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role = 'manager'
      AND p.sector_id = profiles.sector_id
      AND p.deleted_at IS NULL
    )
    -- All active users can see basic info of other active users (for workspace contacts)
    OR (status = 'active')
  )
);

-- Only admin+ can create profiles
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
  -- Allow trigger-based creation (new user signup)
  OR id = auth.uid()
);

-- Users can update their own profile (limited fields via server actions)
-- Admins can update any profile
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sectors_updated_at
  BEFORE UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
