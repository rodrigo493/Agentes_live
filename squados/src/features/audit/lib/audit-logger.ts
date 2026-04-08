import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { AuditAction, AuditStatus } from '@/shared/types/database';

export async function logAudit(params: {
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  status?: AuditStatus;
}) {
  const adminClient = createAdminClient();

  await adminClient.from('audit_logs').insert({
    user_id: params.userId,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    details: params.details ?? {},
    status: params.status ?? 'success',
  });
}

export async function logAccessDenied(params: {
  userId: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}) {
  await logAudit({
    userId: params.userId,
    action: 'access_denied',
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: params.details,
    status: 'denied',
  });
}
