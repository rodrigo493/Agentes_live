-- SquadOS: Sectors table (created before profiles due to FK dependency)

CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  area TEXT,
  icon TEXT,
  agent_id UUID, -- FK added after agents table creation
  parent_sector_id UUID REFERENCES sectors(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sectors_slug ON sectors(slug);
CREATE INDEX idx_sectors_area ON sectors(area);

ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;

-- Everyone can read active sectors
CREATE POLICY sectors_select ON sectors FOR SELECT USING (is_active = true);

-- Only admin+ can insert/update
CREATE POLICY sectors_insert ON sectors FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

CREATE POLICY sectors_update ON sectors FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);
