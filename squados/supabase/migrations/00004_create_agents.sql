-- SquadOS: Agents registry

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  type agent_type NOT NULL,
  sector_id UUID REFERENCES sectors(id),
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  system_prompt TEXT,
  access_level agent_access_level NOT NULL DEFAULT 'sector',
  status agent_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_sector ON agents(sector_id);
CREATE INDEX idx_agents_type ON agents(type);

-- Add FK from sectors to agents
ALTER TABLE sectors ADD CONSTRAINT fk_sectors_agent
  FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_select ON agents FOR SELECT USING (status = 'active');

CREATE POLICY agents_insert ON agents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY agents_update ON agents FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
