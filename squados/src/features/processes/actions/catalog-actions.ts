'use server';

import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { ProcessCatalog, ProcessCatalogMedia, ProcessCatalogFull } from '@/shared/types/database';

export async function getCatalogAction(): Promise<{
  processes?: ProcessCatalogFull[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('process_catalog')
    .select(`
      *,
      sectors(name, icon),
      process_catalog_media(*)
    `)
    .eq('is_active', true)
    .order('title');

  if (error) return { error: error.message };

  const processes = (data ?? []).map((p) => ({
    ...p,
    sector_name: (p.sectors as { name: string } | null)?.name ?? null,
    sector_icon: (p.sectors as { icon: string } | null)?.icon ?? null,
    media: (p.process_catalog_media ?? []) as ProcessCatalogMedia[],
  })) as ProcessCatalogFull[];

  return { processes };
}

export async function createCatalogProcessAction(data: {
  sector_id?: string | null;
  title: string;
  description?: string;
  color?: string;
}): Promise<{ process?: ProcessCatalog; error?: string }> {
  const { user } = await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: process, error } = await admin
    .from('process_catalog')
    .insert({
      sector_id:   data.sector_id ?? null,
      title:       data.title.trim(),
      description: data.description?.trim() || null,
      color:       data.color || 'violet',
      created_by:  user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProcessCatalog };
}

export async function updateCatalogProcessAction(
  id: string,
  data: { sector_id?: string | null; title?: string; description?: string | null; color?: string }
): Promise<{ process?: ProcessCatalog; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: process, error } = await admin
    .from('process_catalog')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProcessCatalog };
}

export async function deleteCatalogProcessAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'manage');
  const admin = createAdminClient();

  const { error } = await admin
    .from('process_catalog')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

export async function addCatalogMediaAction(data: {
  catalog_process_id: string;
  type: 'image' | 'video';
  url: string;
  caption?: string;
}): Promise<{ media?: ProcessCatalogMedia; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('process_catalog_media')
    .select('order_index')
    .eq('catalog_process_id', data.catalog_process_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: media, error } = await admin
    .from('process_catalog_media')
    .insert({
      catalog_process_id: data.catalog_process_id,
      type:        data.type,
      url:         data.url,
      caption:     data.caption?.trim() || null,
      order_index: (last?.order_index ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { media: media as ProcessCatalogMedia };
}

export async function deleteCatalogMediaAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();
  const { error } = await admin.from('process_catalog_media').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
