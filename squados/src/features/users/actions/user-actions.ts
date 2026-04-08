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

export async function listUsersAction() {
  await requirePermission('users', 'read');

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('profiles')
    .select('*, sectors(name, slug)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data };
}
