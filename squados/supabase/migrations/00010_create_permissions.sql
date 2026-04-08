-- SquadOS: Granular user permissions

CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  permission permission_level NOT NULL,
  granted_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, resource_type, resource_id, permission)
);

CREATE INDEX idx_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_permissions_resource ON user_permissions(resource_type, resource_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Users can see their own permissions; admins see all
CREATE POLICY permissions_select ON user_permissions FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- Only admin+ can manage permissions
CREATE POLICY permissions_insert ON user_permissions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY permissions_update ON user_permissions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY permissions_delete ON user_permissions FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);
