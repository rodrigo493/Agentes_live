'use server';

import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { AssignedProcess, ProcessCatalogMedia } from '@/shared/types/database';

export async function getAssignmentsAction(targetUserId?: string): Promise<{
  assignments?: AssignedProcess[];
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const userId = targetUserId ?? user.id;
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin && userId !== user.id) return { error: 'Acesso negado' };

  const { data, error } = await admin
    .from('user_process_assignments')
    .select(`
      id,
      catalog_process_id,
      order_index,
      color,
      process_catalog!catalog_process_id(
        title, description, sector_id,
        sectors(name),
        process_catalog_media(*)
      )
    `)
    .eq('user_id', userId)
    .order('order_index');

  if (error) return { error: error.message };

  const assignments = (data ?? []).map((row) => {
    const cat = row.process_catalog as {
      title: string; description: string | null; sector_id: string | null;
      sectors: { name: string } | null;
      process_catalog_media: ProcessCatalogMedia[];
    } | null;
    return {
      assignment_id: row.id,
      catalog_process_id: row.catalog_process_id,
      order_index: row.order_index,
      color: row.color,
      title: cat?.title ?? '',
      description: cat?.description ?? null,
      sector_id: cat?.sector_id ?? null,
      sector_name: cat?.sectors?.name ?? null,
      media: cat?.process_catalog_media ?? [],
    } as AssignedProcess;
  });

  return { assignments };
}

export async function addAssignmentsAction(
  userId: string,
  catalogProcessIds: string[]
): Promise<{ error?: string }> {
  const { user } = await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('user_process_assignments')
    .select('order_index')
    .eq('user_id', userId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextOrder = (last?.order_index ?? -1) + 1;

  const rows = catalogProcessIds.map((catalog_process_id) => ({
    user_id: userId,
    catalog_process_id,
    order_index: nextOrder++,
    color: 'violet',
    created_by: user.id,
  }));

  const { error } = await admin
    .from('user_process_assignments')
    .insert(rows)
    .select();

  // Ignorar conflito UNIQUE (processo já atribuído)
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    return { error: error.message };
  }
  return {};
}

export async function removeAssignmentAction(assignmentId: string): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();
  const { error } = await admin
    .from('user_process_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) return { error: error.message };
  return {};
}

export async function reorderAssignmentsAction(
  orderedAssignmentIds: string[]
): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  await Promise.all(
    orderedAssignmentIds.map((id, index) =>
      admin
        .from('user_process_assignments')
        .update({ order_index: index })
        .eq('id', id)
    )
  );
  return {};
}
