-- SquadOS: Custom enum types
-- All enums used across the system

CREATE TYPE user_role AS ENUM (
  'master_admin', 'admin', 'manager', 'operator', 'viewer'
);

CREATE TYPE user_status AS ENUM (
  'active', 'inactive', 'suspended'
);

CREATE TYPE conversation_type AS ENUM ('agent', 'dm', 'group');

CREATE TYPE message_sender_type AS ENUM ('user', 'agent', 'system');

CREATE TYPE message_content_type AS ENUM ('text', 'system', 'file', 'image');

CREATE TYPE group_status AS ENUM ('active', 'archived');

CREATE TYPE group_member_role AS ENUM ('admin', 'member');

CREATE TYPE knowledge_doc_type AS ENUM (
  'transcript', 'document', 'procedure', 'manual', 'note', 'other'
);

CREATE TYPE memory_source_type AS ENUM (
  'chat_agent', 'workspace_dm', 'workspace_group',
  'knowledge_doc', 'transcript', 'manual_entry'
);

CREATE TYPE agent_type AS ENUM ('specialist', 'executive', 'governance');

CREATE TYPE agent_access_level AS ENUM ('sector', 'multi_sector', 'global');

CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'draft');

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'login', 'logout',
  'access_denied', 'permission_change', 'role_change',
  'group_create', 'group_member_add', 'group_member_remove',
  'content_upload', 'content_delete', 'export'
);

CREATE TYPE audit_status AS ENUM ('success', 'failure', 'denied');

CREATE TYPE permission_level AS ENUM ('read', 'write', 'manage', 'admin');
