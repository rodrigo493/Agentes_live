-- Migration 00042: unique constraint on workflow_step_attachments.storage_path
-- Prevents duplicate metadata records pointing to the same storage object

ALTER TABLE workflow_step_attachments
  ADD CONSTRAINT uq_wsa_storage_path UNIQUE (storage_path);
