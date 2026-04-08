'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function updateProfileAction(formData: FormData) {
  const { user, profile } = await getAuthenticatedUser();

  const fullName = formData.get('full_name') as string;
  if (!fullName || fullName.trim().length < 2) {
    return { error: 'Nome deve ter pelo menos 2 caracteres' };
  }

  const updateData: Record<string, unknown> = {
    full_name: fullName.trim(),
    updated_at: new Date().toISOString(),
  };

  // Apenas admin e master_admin podem alterar o setor
  if (profile.role === 'admin' || profile.role === 'master_admin') {
    const sectorId = formData.get('sector_id') as string;
    updateData.sector_id = sectorId || null;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);

  if (error) {
    return { error: 'Erro ao atualizar perfil' };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { success: true };
}
