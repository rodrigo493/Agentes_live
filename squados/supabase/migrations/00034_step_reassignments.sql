CREATE TABLE IF NOT EXISTS step_reassignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id        UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  from_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reassigned_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reassigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE step_reassignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY step_reassign_read ON step_reassignments
  FOR SELECT USING (
    reassigned_by = auth.uid()
    OR to_user_id = auth.uid()
    OR from_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

CREATE POLICY step_reassign_insert ON step_reassignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
