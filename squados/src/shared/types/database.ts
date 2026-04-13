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
  active_sector_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
  phone: string | null;
  two_factor_enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  allowed_nav_items: string[] | null;
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

// ── Calendar ──────────────────────────────────────────────

export type CalendarEventType = 'task' | 'meeting' | 'call' | 'event';

export interface CalendarAttendee {
  email: string;
  name: string;
  response: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer: boolean;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  google_event_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  event_type: CalendarEventType;
  location: string | null;
  meet_url: string | null;
  is_all_day: boolean;
  task_id: string | null;
  reminder_minutes: number;
  attendees: CalendarAttendee[];
  google_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  google_email: string | null;
  calendar_id: string;
  created_at: string;
  updated_at: string;
}

export type ProductionColor = 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';

export type TaskFrequency = 'once' | 'daily' | 'weekly';

export interface ProductionTask {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string | null;
  frequency: TaskFrequency;
  scheduled_time: string;       // "HH:MM:SS"
  scheduled_day: number | null; // 0=Dom … 6=Sáb
  scheduled_date: string | null; // "YYYY-MM-DD"
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductionTaskCompletion {
  id: string;
  task_id: string;
  completion_date: string; // "YYYY-MM-DD"
  completed_by: string | null;
  completed_at: string;
}

export interface ProductionProcess {
  id: string;
  title: string;
  description: string | null;
  color: ProductionColor;
  order_index: number;
  is_active: boolean;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductionMediaType = 'image' | 'video';

export interface ProductionMedia {
  id: string;
  process_id: string;
  type: ProductionMediaType;
  url: string;
  caption: string | null;
  order_index: number;
  created_at: string;
}

// ── Process Catalog ───────────────────────────────────────

export interface ProcessCatalog {
  id: string;
  sector_id: string | null;
  title: string;
  description: string | null;
  color: ProductionColor;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProcessCatalogMediaType = 'image' | 'video';

export interface ProcessCatalogMedia {
  id: string;
  catalog_process_id: string;
  type: ProcessCatalogMediaType;
  url: string;
  caption: string | null;
  order_index: number;
  created_at: string;
}

export interface UserProcessAssignment {
  id: string;
  user_id: string;
  catalog_process_id: string;
  order_index: number;
  color: ProductionColor;
  created_by: string | null;
  created_at: string;
}

export interface ProcessCatalogFull extends ProcessCatalog {
  sector_name: string | null;
  sector_icon: string | null;
  media: ProcessCatalogMedia[];
}

export interface AssignedProcess {
  assignment_id: string;
  catalog_process_id: string;
  order_index: number;
  color: ProductionColor;
  title: string;
  description: string | null;
  sector_id: string | null;
  sector_name: string | null;
  media: ProcessCatalogMedia[];
}

// ── Workflow Engine (Operações) ──────────────────────────

export type WorkflowStepStatus =
  | 'pending' | 'in_progress' | 'done' | 'blocked' | 'overdue' | 'skipped';

export type WorkflowInstanceStatus = 'running' | 'completed' | 'cancelled';

export type WorkflowInboxStatus =
  | 'pending' | 'in_progress' | 'done' | 'blocked' | 'overdue';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateStep {
  id: string;
  template_id: string;
  step_order: number;
  title: string;
  description: string | null;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  sla_hours: number;
  payload_schema: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowTemplateFull extends WorkflowTemplate {
  steps: WorkflowTemplateStep[];
}

export interface WorkflowInstance {
  id: string;
  template_id: string;
  reference: string;
  title: string | null;
  status: WorkflowInstanceStatus;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  current_step_id: string | null;
  metadata: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  instance_id: string;
  template_step_id: string;
  step_order: number;
  assignee_id: string | null;
  assignee_sector_id: string | null;
  status: WorkflowStepStatus;
  started_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  payload_data: Record<string, unknown>;
  block_reason_code: string | null;
  block_reason_text: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  created_at: string;
}

export interface WorkflowBlockReason {
  code: string;
  label: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface WorkflowInboxItem {
  id: string;
  user_id: string;
  workflow_step_id: string;
  instance_id: string;
  title: string;
  reference: string | null;
  received_at: string;
  due_at: string;
  handoff_target_at: string;
  handed_off_at: string | null;
  status: WorkflowInboxStatus;
  created_at: string;
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

// === Audio Ingestion Types ===

export type AudioReceiverStatus = 'active' | 'inactive' | 'maintenance' | 'error';

export type AudioEventCategory =
  | 'normal_operations'
  | 'safety_incident'
  | 'cultural_alignment'
  | 'process_deviation'
  | 'harassment_conflict'
  | 'information_leakage'
  | 'fraud_indicator';

export type AudioEventSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type TranscriptionStatus = 'uploading' | 'queued' | 'transcribing' | 'classifying' | 'completed' | 'failed';

export type AudioReviewStatus = 'pending' | 'confirmed' | 'dismissed' | 'escalated';

export type LgpdConsentStatus = 'active' | 'revoked' | 'expired';

export interface AudioReceiver {
  id: string;
  sector_id: string;
  name: string;
  location_description: string | null;
  device_identifier: string | null;
  status: AudioReceiverStatus;
  config: Record<string, unknown>;
  sensitivity_config: Record<string, unknown>;
  device_token: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudioSegment {
  id: string;
  receiver_id: string;
  sector_id: string;
  storage_path: string;
  file_size: number | null;
  duration_seconds: number | null;
  mime_type: string;
  recorded_at: string;
  status: TranscriptionStatus;
  retry_count: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  retention_expires_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AudioTranscription {
  id: string;
  segment_id: string;
  receiver_id: string;
  sector_id: string;
  raw_text: string;
  anonymized_text: string | null;
  language: string;
  confidence: number | null;
  word_timestamps: unknown | null;
  transcription_model: string;
  transcription_duration_ms: number | null;
  event_category: AudioEventCategory;
  event_severity: AudioEventSeverity;
  classification_reasoning: string | null;
  classification_confidence: number | null;
  classification_model: string | null;
  knowledge_doc_id: string | null;
  processed_memory_id: string | null;
  maestro_alert_id: string | null;
  speakers_detected: number;
  speaker_map: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface AudioEventReview {
  id: string;
  transcription_id: string;
  sector_id: string;
  event_category: AudioEventCategory;
  event_severity: AudioEventSeverity;
  anonymized_text: string;
  classification_reasoning: string | null;
  review_status: AudioReviewStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  review_action: string | null;
  reviewed_at: string | null;
  escalated_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudioLgpdConfig {
  id: string;
  sector_id: string | null;
  retention_days: number;
  transcription_retention_days: number;
  anonymize_by_default: boolean;
  require_explicit_consent: boolean;
  allowed_categories: AudioEventCategory[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudioConsentRecord {
  id: string;
  user_id: string | null;
  sector_id: string;
  consent_type: string;
  consent_status: LgpdConsentStatus;
  consent_given_at: string;
  consent_revoked_at: string | null;
  legal_basis: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// === Vision Computacional Types ===

export type CameraType = 'ip_camera' | 'usb_camera' | 'industrial' | 'mobile' | 'simulated';

export type CameraStatus = 'provisioned' | 'active' | 'inactive' | 'maintenance' | 'error';

export type VisionCaptureStatus = 'queued' | 'analyzing' | 'completed' | 'failed' | 'skipped';

export type VisionEventType =
  | 'epi_missing'
  | 'epi_incorrect'
  | 'process_deviation'
  | 'quality_anomaly'
  | 'safety_risk'
  | 'bottleneck'
  | 'equipment_anomaly'
  | 'unauthorized_area'
  | 'idle_station'
  | 'material_waste'
  | 'other';

export type VisionZoneType = 'production' | 'quality' | 'logistics' | 'safety' | 'restricted' | 'common';

export type VisionReviewStatus = 'pending' | 'confirmed' | 'dismissed' | 'escalated';

export interface CameraDevice {
  id: string;
  sector_id: string;
  name: string;
  location_description: string | null;
  cell_name: string | null;
  device_identifier: string | null;
  camera_type: CameraType;
  stream_url: string | null;
  status: CameraStatus;
  config: Record<string, unknown>;
  detection_config: Record<string, unknown>;
  device_token: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisionCapture {
  id: string;
  camera_id: string;
  sector_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_size: number | null;
  resolution: string | null;
  captured_at: string;
  status: VisionCaptureStatus;
  retry_count: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  retention_expires_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface VisionEvent {
  id: string;
  capture_id: string;
  camera_id: string;
  sector_id: string;
  event_type: VisionEventType;
  severity: AudioEventSeverity;
  confidence: number | null;
  description: string | null;
  bounding_boxes: unknown[];
  detection_model: string | null;
  knowledge_doc_id: string | null;
  processed_memory_id: string | null;
  maestro_alert_id: string | null;
  review_status: VisionReviewStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisionZoneProfile {
  id: string;
  sector_id: string;
  zone_name: string;
  zone_type: VisionZoneType;
  required_epi: string[];
  expected_process: string | null;
  risk_level: string;
  detection_rules: Record<string, unknown>;
  camera_ids: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisionLgpdConfig {
  id: string;
  sector_id: string | null;
  capture_retention_days: number;
  event_retention_days: number;
  blur_faces: boolean;
  blur_badges: boolean;
  store_raw_frames: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// === Maestro Alert Types ===

export type MaestroAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface MaestroAlert {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  sector_id: string | null;
  sector_name: string | null;
  user_name: string | null;
  alert_content: string;
  original_message: string | null;
  severity: MaestroAlertSeverity;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}
