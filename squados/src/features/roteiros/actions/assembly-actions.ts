'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type {
  AssemblyProcedure,
  AssemblyProcedureFull,
  AssemblyProcedureMedia,
  AssemblyMediaType,
} from '@/shared/types/database';

async function requireAdmin() {
  const { user, profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    throw new Error('Apenas administradores podem gerenciar roteiros');
  }
  return { user, profile };
}

export async function listProceduresBySectorAction(sectorId: string): Promise<{
  procedures?: AssemblyProcedureFull[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('assembly_procedures')
    .select('*, sectors(name, icon), assembly_procedure_media(*)')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .order('title');
  if (error) return { error: error.message };

  const procedures = (data ?? []).map((p) => ({
    ...p,
    sector_name: (p.sectors as { name: string } | null)?.name ?? null,
    sector_icon: (p.sectors as { icon: string } | null)?.icon ?? null,
    media: ((p.assembly_procedure_media ?? []) as AssemblyProcedureMedia[])
      .sort((a, b) => a.order_index - b.order_index),
  })) as AssemblyProcedureFull[];

  return { procedures };
}

export async function getProceduresCountPerSectorAction(): Promise<{
  counts?: Record<string, number>;
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('assembly_procedures')
    .select('sector_id')
    .eq('is_active', true);
  if (error) return { error: error.message };
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.sector_id] = (counts[row.sector_id] ?? 0) + 1;
  }
  return { counts };
}

export async function createProcedureAction(data: {
  sector_id: string;
  title: string;
  description?: string;
  procedure_text: string;
  tags?: string[];
}): Promise<{ procedure?: AssemblyProcedure; error?: string }> {
  try {
    const { user } = await requireAdmin();
    const admin = createAdminClient();
    const { data: p, error } = await admin
      .from('assembly_procedures')
      .insert({
        sector_id:      data.sector_id,
        title:          data.title.trim(),
        description:    data.description?.trim() || null,
        procedure_text: data.procedure_text.trim(),
        tags:           data.tags ?? [],
        created_by:     user.id,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { procedure: p as AssemblyProcedure };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateProcedureAction(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    procedure_text?: string;
    tags?: string[];
  }
): Promise<{ procedure?: AssemblyProcedure; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data: p, error } = await admin
      .from('assembly_procedures')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { procedure: p as AssemblyProcedure };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteProcedureAction(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin
      .from('assembly_procedures')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function uploadProcedureMediaAction(formData: FormData): Promise<{
  media?: AssemblyProcedureMedia;
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const file = formData.get('file') as File | null;
    const procedureId = formData.get('procedure_id') as string;
    const type = formData.get('type') as AssemblyMediaType;
    const caption = (formData.get('caption') as string) || '';
    if (!file || !procedureId || !type) return { error: 'Dados incompletos' };

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `${procedureId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from('roteiros').upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return { error: upErr.message };

    const { data: pub } = admin.storage.from('roteiros').getPublicUrl(path);

    const { data: last } = await admin
      .from('assembly_procedure_media')
      .select('order_index')
      .eq('procedure_id', procedureId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: media, error } = await admin
      .from('assembly_procedure_media')
      .insert({
        procedure_id: procedureId,
        type,
        url:          pub.publicUrl,
        caption:      caption || null,
        order_index:  (last?.order_index ?? -1) + 1,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { media: media as AssemblyProcedureMedia };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteProcedureMediaAction(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from('assembly_procedure_media').delete().eq('id', id);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
