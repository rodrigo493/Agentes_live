'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission } from '@/shared/lib/rbac/guards';
import { logAudit } from '@/features/audit/lib/audit-logger';
import { randomBytes } from 'crypto';

// ===== Camera CRUD =====

export async function listCamerasAction() {
  await requirePermission('vision_monitoring', 'read');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('camera_devices')
    .select('*, sectors(name, slug)')
    .eq('is_active', true)
    .order('name');

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createCameraAction(formData: FormData) {
  const { user } = await requirePermission('vision_monitoring', 'write');
  const admin = createAdminClient();

  const name = formData.get('name') as string;
  const sectorId = formData.get('sector_id') as string;
  const cellName = (formData.get('cell_name') as string) || null;
  const locationDescription = (formData.get('location_description') as string) || null;
  const deviceIdentifier = (formData.get('device_identifier') as string) || null;
  const cameraType = (formData.get('camera_type') as string) || 'ip_camera';

  if (!name || name.length < 2) return { error: 'Nome deve ter pelo menos 2 caracteres' };
  if (!sectorId) return { error: 'Setor obrigatório' };

  const deviceToken = randomBytes(32).toString('hex');

  const { data, error } = await admin
    .from('camera_devices')
    .insert({
      name,
      sector_id: sectorId,
      cell_name: cellName,
      location_description: locationDescription,
      device_identifier: deviceIdentifier,
      camera_type: cameraType,
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
    resourceType: 'camera_device',
    resourceId: data.id,
    details: { name, sector_id: sectorId, cell_name: cellName, camera_type: cameraType },
  });

  return { success: true, data };
}

export async function updateCameraAction(cameraId: string, updates: Record<string, unknown>) {
  const { user } = await requirePermission('vision_monitoring', 'write');
  const admin = createAdminClient();

  const { error } = await admin
    .from('camera_devices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', cameraId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'update',
    resourceType: 'camera_device',
    resourceId: cameraId,
    details: updates,
  });

  return { success: true };
}

export async function deleteCameraAction(cameraId: string) {
  const { user } = await requirePermission('vision_monitoring', 'manage');
  const admin = createAdminClient();

  const { error } = await admin
    .from('camera_devices')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', cameraId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'delete',
    resourceType: 'camera_device',
    resourceId: cameraId,
    details: { soft_delete: true },
  });

  return { success: true };
}

// ===== Zone Profiles =====

export async function listZoneProfilesAction() {
  await requirePermission('vision_monitoring', 'read');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('vision_zone_profiles')
    .select('*, sectors(name, slug)')
    .eq('is_active', true)
    .order('zone_name');

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createZoneProfileAction(formData: FormData) {
  const { user } = await requirePermission('vision_monitoring', 'write');
  const admin = createAdminClient();

  const zoneName = formData.get('zone_name') as string;
  const sectorId = formData.get('sector_id') as string;
  const zoneType = (formData.get('zone_type') as string) || 'production';
  const riskLevel = (formData.get('risk_level') as string) || 'medium';
  const expectedProcess = (formData.get('expected_process') as string) || null;
  const requiredEpiStr = (formData.get('required_epi') as string) || '';
  const requiredEpi = requiredEpiStr.split(',').map((s) => s.trim()).filter(Boolean);

  if (!zoneName || zoneName.length < 2) return { error: 'Nome da zona deve ter pelo menos 2 caracteres' };
  if (!sectorId) return { error: 'Setor obrigatório' };

  const { data, error } = await admin
    .from('vision_zone_profiles')
    .insert({
      zone_name: zoneName,
      sector_id: sectorId,
      zone_type: zoneType,
      risk_level: riskLevel,
      expected_process: expectedProcess,
      required_epi: requiredEpi,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: 'create',
    resourceType: 'vision_zone_profile',
    resourceId: data.id,
    details: { zone_name: zoneName, sector_id: sectorId, zone_type: zoneType },
  });

  return { success: true, data };
}

// ===== Stats =====

export async function getVisionStatsAction() {
  await requirePermission('vision_monitoring', 'read');
  const admin = createAdminClient();

  const [
    { count: camerasCount },
    { count: capturesCount },
    { count: eventsCount },
    { count: pendingReviews },
    { count: zonesCount },
  ] = await Promise.all([
    admin.from('camera_devices').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('vision_captures').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
    admin.from('vision_events').select('*', { count: 'exact', head: true }),
    admin.from('vision_events').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
    admin.from('vision_zone_profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  return {
    cameras: camerasCount ?? 0,
    captures: capturesCount ?? 0,
    events: eventsCount ?? 0,
    pendingReviews: pendingReviews ?? 0,
    zones: zonesCount ?? 0,
  };
}
