CREATE TABLE IF NOT EXISTS step_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id    UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE step_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY step_comments_read ON step_comments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workflow_steps ws
      JOIN workflow_instances wi ON wi.id = ws.instance_id
      WHERE ws.id = step_comments.step_id
        AND (ws.assignee_id = auth.uid() OR wi.started_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

CREATE POLICY step_comments_insert ON step_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM workflow_steps WHERE id = step_comments.step_id AND assignee_id = auth.uid()
    )
  );
