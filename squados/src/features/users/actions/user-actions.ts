'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { requirePermission } from '@/shared/lib/rbac/guards';
import { createUserSchema, updateUserSchema } from '@/shared/lib/validation/schemas';
import { logAudit } from '@/features/audit/lib/audit-logger';

export async function createUserAction(formData: FormData) {
  const { user, profile } = await requirePermission('users', 'write');

  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    full_name: formData.get('full_name') as string,
    role: formData.get('role') as string,
    sector_id: formData.get('sector_id') as string || null,
    phone: formData.get('phone') as string || null,
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Prevent privilege escalation: admin cannot create master_admin
  if (parsed.data.role === 'master_admin' && profile.role !== 'master_admin') {
    return { error: 'Apenas master_admin pode criar outros master_admin' };
  }

  const adminClient = createAdminClient();

  // Create auth user
  const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Parse allowed_nav_items from FormData
  const allowedNavRaw = formData.get('allowed_nav_items') as string | null;
  let allowedNavItems: string[] | null = null;
  if (allowedNavRaw) {
    try { allowedNavItems = JSON.parse(allowedNavRaw); } catch { /* ignore */ }
  }

  // admin/master_admin always get null (see everything)
  if (parsed.data.role === 'admin' || parsed.data.role === 'master_admin') {
    allowedNavItems = null;
  }

  // Update profile with role and sector (trigger already created the profile)
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      sector_id: parsed.data.sector_id,
      phone: parsed.data.phone,
      allowed_nav_items: allowedNavItems,
    })
    .eq('id', newUser.user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  await logAudit({
    userId: user.id,
    action: 'create',
    resourceType: 'user',
    resourceId: newUser.user.id,
    details: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidatePath('/users');
  return { success: true, userId: newUser.user.id };
}

export async function updateUserAction(userId: string, data: Record<string, unknown>) {
  const { user, profile } = await requirePermission('users', 'write');

  const parsed = updateUserSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Prevent privilege escalation
  if (parsed.data.role === 'master_admin' && profile.role !== 'master_admin') {
    return { error: 'Apenas master_admin pode promover para master_admin' };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return { error: error.message };
  }

  // Log role change specifically
  if (parsed.data.role) {
    await logAudit({
      userId: user.id,
      action: 'role_change',
      resourceType: 'user',
      resourceId: userId,
      details: { new_role: parsed.data.role },
    });
  } else {
    await logAudit({
      userId: user.id,
      action: 'update',
      resourceType: 'user',
      resourceId: userId,
      details: parsed.data,
    });
  }

  revalidatePath('/users');
  return { success: true };
}

export async function deactivateUserAction(userId: string) {
  const { user } = await requirePermission('users', 'manage');

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('profiles')
    .update({
      status: 'inactive',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    action: 'delete',
    resourceType: 'user',
    resourceId: userId,
    details: { soft_delete: true },
  });

  revalidatePath('/users');
  return { success: true };
}

export async function updateUserCredentialsAction(
  userId: string,
  data: { email?: string; password?: string }
) {
  const { profile } = await requirePermission('users', 'manage');

  // Only admin and master_admin can change email/password
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissão para alterar credenciais' };
  }

  if (!data.email && !data.password) {
    return { success: true };
  }

  if (data.password && data.password.length < 8) {
    return { error: 'Senha deve ter pelo menos 8 caracteres' };
  }

  const adminClient = createAdminClient();
  const updates: { email?: string; password?: string } = {};
  if (data.email) updates.email = data.email;
  if (data.password) updates.password = data.password;

  const { error } = await adminClient.auth.admin.updateUserById(userId, updates);
  if (error) {
    return { error: error.message };
  }

  // Keep profiles.email in sync
  if (data.email) {
    await adminClient.from('profiles').update({ email: data.email }).eq('id', userId);
  }

  revalidatePath('/users');
  return { success: true };
}

export async function updateUserAvatarAction(userId: string, avatarUrl: string) {
  const { profile } = await requirePermission('users', 'manage');

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissão' };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (error) return { error: error.message };
  revalidatePath('/users');
  revalidatePath('/workspace');
  return { success: true };
}

/**
 * Upload + set avatar em uma unica chamada server-side.
 * Usa service role para escapar da RLS do bucket `avatars`
 * (que so permite cada usuario escrever no proprio folder).
 */
export async function uploadAndSetUserAvatarAction(
  userId: string,
  formData: FormData
) {
  const { profile } = await requirePermission('users', 'manage');

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissao para alterar avatar' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Arquivo invalido' };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { error: 'Imagem muito grande. Maximo 2 MB.' };
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const adminClient = createAdminClient();

  const { error: uploadError } = await adminClient.storage
    .from('avatars')
    .upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });

  if (uploadError) {
    console.error('[uploadAndSetUserAvatarAction] upload error:', uploadError);
    return { error: uploadError.message };
  }

  const { data: publicData } = adminClient.storage.from('avatars').getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  if (updateError) {
    console.error('[uploadAndSetUserAvatarAction] update error:', updateError);
    return { error: updateError.message };
  }

  revalidatePath('/users');
  revalidatePath('/workspace');
  return { success: true, url: publicUrl };
}

export async function getUserSectorsAction(userId: string) {
  await requirePermission('users', 'read');

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', userId);

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function updateUserSectorsAction(userId: string, sectorIds: string[]) {
  const { user, profile } = await requirePermission('users', 'manage');

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissão para gerenciar setores' };
  }

  const adminClient = createAdminClient();

  // Busca setores atuais
  const { data: current, error: currentError } = await adminClient
    .from('user_sectors')
    .select('sector_id')
    .eq('user_id', userId);

  if (currentError) {
    console.error('[updateUserSectorsAction] fetch current error:', currentError);
    return { error: currentError.message };
  }

  const currentIds = (current ?? []).map((r) => r.sector_id);
  const toAdd = sectorIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !sectorIds.includes(id));

  // Remove desmarcados
  if (toRemove.length > 0) {
    const { error: deleteError } = await adminClient
      .from('user_sectors')
      .delete()
      .eq('user_id', userId)
      .in('sector_id', toRemove);
    if (deleteError) {
      console.error('[updateUserSectorsAction] delete error:', deleteError);
      return { error: deleteError.message };
    }
  }

  // Adiciona marcados
  if (toAdd.length > 0) {
    const { error: insertError } = await adminClient.from('user_sectors').insert(
      toAdd.map((sector_id) => ({
        user_id: userId,
        sector_id,
        assigned_by: user.id,
      }))
    );
    if (insertError) {
      console.error('[updateUserSectorsAction] insert error:', insertError);
      return { error: insertError.message };
    }
  }

  // Se o setor ativo foi removido, zera active_sector_id
  if (toRemove.length > 0) {
    const { data: profileData } = await adminClient
      .from('profiles')
      .select('active_sector_id')
      .eq('id', userId)
      .single();

    if (profileData?.active_sector_id && toRemove.includes(profileData.active_sector_id)) {
      await adminClient
        .from('profiles')
        .update({ active_sector_id: null })
        .eq('id', userId);
    }
  }

  revalidatePath('/users');
  return { success: true };
}

export async function listUsersAction() {
  await requirePermission('users', 'read');

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('profiles')
    .select('*, sectors!sector_id(name, slug)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data };
}
