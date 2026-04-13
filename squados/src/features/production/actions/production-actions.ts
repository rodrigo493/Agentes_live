'use server';

import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { ProductionProcess, ProductionMedia } from '@/shared/types/database';

// ── Fetch ─────────────────────────────────────────────────

export async function getProductionDataAction(targetUserId?: string): Promise<{
  processes?: ProductionProcess[];
  media?: ProductionMedia[];
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const userId = targetUserId ?? user.id;

  // Se não é admin e tentou pedir dados de outro usuário, nega
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin && userId !== user.id) return { error: 'Acesso negado' };

  const [{ data: processes, error: pErr }, { data: media, error: mErr }] = await Promise.all([
    admin
      .from('production_processes')
      .select('*')
      .eq('is_active', true)
      .eq('assigned_to', userId)
      .order('order_index', { ascending: true }),
    admin
      .from('production_media')
      .select('*')
      .order('order_index', { ascending: true }),
  ]);

  if (pErr) return { error: pErr.message };
  if (mErr) return { error: mErr.message };

  return { processes: (processes ?? []) as ProductionProcess[], media: (media ?? []) as ProductionMedia[] };
}

// ── Create ────────────────────────────────────────────────

export async function createProcessAction(data: {
  title: string;
  description?: string;
  color?: string;
  assigned_to: string;
}): Promise<{ process?: ProductionProcess; error?: string }> {
  const { user } = await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('production_processes')
    .select('order_index')
    .eq('is_active', true)
    .eq('assigned_to', data.assigned_to)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.order_index ?? -1) + 1;

  const { data: process, error } = await admin
    .from('production_processes')
    .insert({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      color: data.color || 'violet',
      order_index: nextOrder,
      assigned_to: data.assigned_to,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProductionProcess };
}

// ── Update ────────────────────────────────────────────────

export async function updateProcessAction(
  id: string,
  data: { title?: string; description?: string; color?: string }
): Promise<{ process?: ProductionProcess; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: process, error } = await admin
    .from('production_processes')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProductionProcess };
}

// ── Delete (soft) ─────────────────────────────────────────

export async function deleteProcessAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'manage');
  const admin = createAdminClient();

  const { error } = await admin
    .from('production_processes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

// ── Reorder ───────────────────────────────────────────────

export async function reorderProcessesAction(
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      admin
        .from('production_processes')
        .update({ order_index: index, updated_at: new Date().toISOString() })
        .eq('id', id)
    )
  );

  return {};
}

// ── Media ─────────────────────────────────────────────────

export async function addMediaAction(data: {
  process_id: string;
  type: 'image' | 'video';
  url: string;
  caption?: string;
}): Promise<{ media?: ProductionMedia; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('production_media')
    .select('order_index')
    .eq('process_id', data.process_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.order_index ?? -1) + 1;

  const { data: media, error } = await admin
    .from('production_media')
    .insert({
      process_id: data.process_id,
      type: data.type,
      url: data.url,
      caption: data.caption?.trim() || null,
      order_index: nextOrder,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { media: media as ProductionMedia };
}

export async function deleteMediaAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { error } = await admin.from('production_media').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
