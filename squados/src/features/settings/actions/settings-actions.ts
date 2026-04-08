'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function updateProfileAction(formData: FormData) {
  const { user } = await getAuthenticatedUser();

  const fullName = formData.get('full_name') as string;
  if (!fullName || fullName.trim().length < 2) {
    return { error: 'Nome deve ter pelo menos 2 caracteres' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: fullName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Erro ao atualizar perfil' };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { success: true };
}
