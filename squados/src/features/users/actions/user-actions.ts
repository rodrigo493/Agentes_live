'use server';

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

  // Update profile with role and sector (trigger already created the profile)
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      sector_id: parsed.data.sector_id,
      phone: parsed.data.phone,
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
  return { success: true };
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
  const { data: current } = await adminClient
    .from('user_sectors')
    .select('sector_id')
    .eq('user_id', userId);

  const currentIds = (current ?? []).map((r) => r.sector_id);
  const toAdd = sectorIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !sectorIds.includes(id));

  // Remove desmarcados
  if (toRemove.length > 0) {
    await adminClient
      .from('user_sectors')
      .delete()
      .eq('user_id', userId)
      .in('sector_id', toRemove);
  }

  // Adiciona marcados
  if (toAdd.length > 0) {
    await adminClient.from('user_sectors').insert(
      toAdd.map((sector_id) => ({
        user_id: userId,
        sector_id,
        assigned_by: user.id,
      }))
    );
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
