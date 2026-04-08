'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission } from '@/shared/lib/rbac/guards';
import { createReceiverSchema } from '@/shared/lib/validation/schemas';
import { logAudit } from '@/features/audit/lib/audit-logger';
import { randomBytes } from 'crypto';

export async function listReceiversAction() {
  const { profile } = await requirePermission('audio_monitoring', 'read');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('audio_receivers')
    .select('*, sectors(name, slug)')
    .eq('is_active', true)
    .order('name');

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createReceiverAction(formData: FormData) {
  const { user } = await requirePermission('audio_monitoring', 'write');
  const admin = createAdminClient();

  const raw = {
    sector_id: formData.get('sector_id') as string,
    name: formData.get('name') as string,
    location_description: (formData.get('location_description') as string) || null,
    device_identifier: (formData.get('device_identifier') as string) || null,
  };

  const parsed = createReceiverSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const deviceToken = randomBytes(32).toString('hex');

  const { data, error } = await admin
    .from('audio_receivers')
    .insert({
      ...parsed.data,
      device_token: deviceToken,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'Identificador de dispositivo já existe' };
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    action: 'create',
    resourceType: 'audio_receiver',
    resourceId: data.id,
    details: { name: parsed.data.name, sector_id: parsed.data.sector_id },
  });

  return { success: true, data };
}

export async function updateReceiverAction(receiverId: string, updates: Record<string, unknown>) {
  const { user } = await requirePermission('audio_monitoring', 'write');
  const admin = createAdminClient();

  const { error } = await admin
    .from('audio_receivers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', receiverId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'update',
    resourceType: 'audio_receiver',
    resourceId: receiverId,
    details: updates,
  });

  return { success: true };
}

export async function deleteReceiverAction(receiverId: string) {
  const { user } = await requirePermission('audio_monitoring', 'manage');
  const admin = createAdminClient();

  const { error } = await admin
    .from('audio_receivers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', receiverId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'delete',
    resourceType: 'audio_receiver',
    resourceId: receiverId,
    details: { soft_delete: true },
  });

  return { success: true };
}

export async function getAudioStatsAction() {
  await requirePermission('audio_monitoring', 'read');
  const admin = createAdminClient();

  const [
    { count: receiversCount },
    { count: segmentsTotal },
    { count: segmentsQueued },
    { count: transcriptionsCount },
    { count: reviewsPending },
  ] = await Promise.all([
    admin.from('audio_receivers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('audio_segments').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
    admin.from('audio_segments').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
    admin.from('audio_transcriptions').select('*', { count: 'exact', head: true }),
    admin.from('audio_event_reviews').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
  ]);

  return {
    receivers: receiversCount ?? 0,
    segments: segmentsTotal ?? 0,
    queued: segmentsQueued ?? 0,
    transcriptions: transcriptionsCount ?? 0,
    pendingReviews: reviewsPending ?? 0,
  };
}
