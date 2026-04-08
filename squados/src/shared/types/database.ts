export type UserRole = 'master_admin' | 'admin' | 'manager' | 'operator' | 'viewer';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export type ConversationType = 'agent' | 'dm' | 'group';

export type MessageSenderType = 'user' | 'agent' | 'system';

export type MessageContentType = 'text' | 'system' | 'file' | 'image';

export type GroupStatus = 'active' | 'archived';

export type GroupMemberRole = 'admin' | 'member';

export type KnowledgeDocType =
  | 'transcript'
  | 'document'
  | 'procedure'
  | 'manual'
  | 'note'
  | 'other';

export type MemorySourceType =
  | 'chat_agent'
  | 'workspace_dm'
  | 'workspace_group'
  | 'knowledge_doc'
  | 'transcript'
  | 'manual_entry';

export type MemoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export type KnowledgeCategory =
  | 'procedure'
  | 'policy'
  | 'technical'
  | 'operational'
  | 'decision'
  | 'lesson_learned'
  | 'faq'
  | 'general';

export type KnowledgeValidationStatus = 'auto_validated' | 'human_validated' | 'pending_review' | 'rejected';

export type AgentContextPolicy = 'own_user_only' | 'group_if_relevant' | 'sector_only' | 'global_executive';

export type AgentType = 'specialist' | 'executive' | 'governance';

export type AgentAccessLevel = 'sector' | 'multi_sector' | 'global';

export type AgentStatus = 'active' | 'inactive' | 'draft';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'access_denied'
  | 'permission_change'
  | 'role_change'
  | 'group_create'
  | 'group_member_add'
  | 'group_member_remove'
  | 'content_upload'
  | 'content_delete'
  | 'export';

export type AuditStatus = 'success' | 'failure' | 'denied';

export type PermissionLevel = 'read' | 'write' | 'manage' | 'admin';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  sector_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
  phone: string | null;
  two_factor_enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Sector {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  area: string | null;
  icon: string | null;
  agent_id: string | null;
  parent_sector_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  sector_id: string | null;
  group_id: string | null;
  participant_ids: string[];
  title: string | null;
  metadata: Record<string, unknown>;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: MessageSenderType;
  content: string;
  content_type: MessageContentType;
  metadata: Record<string, unknown>;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  sector_id: string | null;
  created_by: string;
  avatar_url: string | null;
  status: GroupStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  joined_at: string;
  added_by: string | null;
}

export interface KnowledgeDoc {
  id: string;
  sector_id: string;
  title: string;
  content: string | null;
  doc_type: KnowledgeDocType;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// CAMADA 2: Memória processada (filtrada e organizada)
export interface ProcessedMemory {
  id: string;
  sector_id: string;
  source_type: MemorySourceType;
  source_id: string | null;
  content: string;
  summary: string | null;
  user_id: string | null;
  context: Record<string, unknown>;
  tags: string[];
  relevance_score: number;
  processing_status: MemoryProcessingStatus;
  processed_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// CAMADA 3: Conhecimento validado (fonte principal dos agentes)
export interface KnowledgeMemory {
  id: string;
  sector_id: string;
  source_memory_id: string | null;
  title: string;
  content: string;
  category: KnowledgeCategory;
  confidence_score: number;
  validated_by: string | null;
  validation_status: KnowledgeValidationStatus;
  tags: string[];
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  display_name: string;
  type: AgentType;
  sector_id: string | null;
  description: string | null;
  config: Record<string, unknown>;
  system_prompt: string | null;
  access_level: AgentAccessLevel;
  context_policy: AgentContextPolicy;
  status: AgentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: AuditStatus;
  created_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  resource_type: string;
  resource_id: string | null;
  permission: PermissionLevel;
  granted_by: string;
  expires_at: string | null;
  created_at: string;
}

export type AgentCommunicationType =
  | 'report'
  | 'escalation'
  | 'directive'
  | 'analysis_request'
  | 'analysis_response'
  | 'consolidated';

export type AgentCommunicationPriority = 'low' | 'normal' | 'high' | 'critical';

export type AgentCommunicationStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'acknowledged'
  | 'acted_upon';

export type AgentHierarchyRelationship = 'reports_to' | 'advises' | 'governs';

export interface AgentCommunication {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  communication_type: AgentCommunicationType;
  subject: string;
  content: string;
  context: Record<string, unknown>;
  source_sectors: string[];
  source_memories: string[];
  priority: AgentCommunicationPriority;
  status: AgentCommunicationStatus;
  parent_id: string | null;
  created_at: string;
  processed_at: string | null;
  acknowledged_at: string | null;
}

export interface AgentHierarchy {
  id: string;
  parent_agent_id: string;
  child_agent_id: string;
  relationship_type: AgentHierarchyRelationship;
  metadata: Record<string, unknown>;
  created_at: string;
}
