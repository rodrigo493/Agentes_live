-- Migration 00041: Hardening for workflow_step_attachments table
-- Fixes:
--   1. Add BEFORE UPDATE trigger to prevent mutations of immutable fields
--   2. Add CHECK constraint to ensure decision fields are consistent (all NULL or all NOT NULL)

-- Function to guard immutable fields in workflow_step_attachments
CREATE OR REPLACE FUNCTION wsa_guard_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.file_name    IS DISTINCT FROM NEW.file_name    OR
     OLD.storage_path IS DISTINCT FROM NEW.storage_path OR
     OLD.uploaded_by  IS DISTINCT FROM NEW.uploaded_by  OR
     OLD.file_size    IS DISTINCT FROM NEW.file_size    OR
     OLD.mime_type    IS DISTINCT FROM NEW.mime_type    OR
     OLD.instance_id  IS DISTINCT FROM NEW.instance_id  OR
     OLD.step_id      IS DISTINCT FROM NEW.step_id      THEN
    RAISE EXCEPTION 'workflow_step_attachments: immutable fields cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce immutability on UPDATE
CREATE TRIGGER trg_wsa_immutable
  BEFORE UPDATE ON workflow_step_attachments
  FOR EACH ROW EXECUTE FUNCTION wsa_guard_immutable();

-- Constraint to ensure decision fields are consistent
ALTER TABLE workflow_step_attachments
  ADD CONSTRAINT decision_fields_consistent CHECK (
    (decision IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR
    (decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  );
