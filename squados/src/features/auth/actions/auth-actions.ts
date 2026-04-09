'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { loginSchema } from '@/shared/lib/validation/schemas';

export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Log failed login attempt
    const adminClient = createAdminClient();
    await adminClient.from('audit_logs').insert({
      action: 'login',
      resource_type: 'auth',
      details: { email: parsed.data.email, error: error.message },
      status: 'failure',
    });
    return { error: 'Email ou senha incorretos' };
  }

  // Log successful login
  const { data: { user: loggedUser } } = await supabase.auth.getUser();
  if (loggedUser) {
    const adminClient = createAdminClient();

    await adminClient
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', loggedUser.id);

    await adminClient.from('audit_logs').insert({
      user_id: loggedUser.id,
      action: 'login',
      resource_type: 'auth',
      details: { email: parsed.data.email },
      status: 'success',
    });

    // Verificar setores do usuário para redirecionar corretamente
    const { data: sectors } = await adminClient
      .from('user_sectors')
      .select('sector_id')
      .eq('user_id', loggedUser.id);

    const sectorCount = (sectors ?? []).length;

    if (sectorCount === 1) {
      await adminClient
        .from('profiles')
        .update({ active_sector_id: sectors![0].sector_id })
        .eq('id', loggedUser.id);
      redirect('/dashboard');
    }

    if (sectorCount >= 2) {
      redirect('/select-sector');
    }
  }

  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const adminClient = createAdminClient();
    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'logout',
      resource_type: 'auth',
      status: 'success',
    });
  }

  await supabase.auth.signOut();
  redirect('/login');
}

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email obrigatório' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: 'Erro ao enviar email de recuperação' };
  }

  return { success: true };
}

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirm_password') as string;

  if (!password || password.length < 8) {
    return { error: 'Senha deve ter pelo menos 8 caracteres' };
  }

  if (password !== confirmPassword) {
    return { error: 'As senhas não coincidem' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: 'Sessão expirada. Solicite um novo link de recuperação.' };
  }

  redirect('/login');
}

export async function selectSectorAction(sectorId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const admin = createAdminClient();

  // Verifica que o usuário realmente tem acesso a este setor
  const { data: userSector } = await admin
    .from('user_sectors')
    .select('sector_id')
    .eq('user_id', user.id)
    .eq('sector_id', sectorId)
    .single();

  if (!userSector) return { error: 'Setor não disponível para este usuário' };

  const { error } = await admin
    .from('profiles')
    .update({ active_sector_id: sectorId })
    .eq('id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  return { success: true };
}
