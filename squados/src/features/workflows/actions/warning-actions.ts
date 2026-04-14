'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { sendPushNotification } from '@/shared/lib/push/web-push';

export interface WorkflowWarning {
  id: string;
  workflow_step_id: string | null;
  instance_id: string | null;
  sent_by: string;
  sent_to: string;
  reason: string;
  message: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export async function sendWarningAction(
  stepId: string,
  reason: string,
  message?: string
): Promise<{ warning_id?: string; error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_workflow_warning', {
    p_step_id: stepId,
    p_reason:  reason.trim(),
    p_message: message?.trim() || null,
  });
  if (error) return { error: error.message };

  // Disparar Web Push para todos os master_admin (best-effort)
  try {
    const admin = createAdminClient();
    const { data: adminProfiles } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'master_admin');

    if (adminProfiles && adminProfiles.length > 0) {
      const adminIds = adminProfiles.map((p) => p.id);
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('user_id', adminIds);

      if (subs && subs.length > 0) {
        await Promise.allSettled(
          subs.map((s) =>
            sendPushNotification(s.endpoint, s.p256dh, s.auth, {
              title: '⚠️ Advertência enviada',
              body: `Motivo: ${reason}${message ? ' — ' + message : ''}`,
              url: '/operacoes',
            })
          )
        );
      }
    }
  } catch {
    // Push é best-effort; não bloqueia o retorno
  }

  return { warning_id: data as string };
}

export async function acknowledgeWarningAction(id: string): Promise<{ error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc('acknowledge_workflow_warning', { p_warning_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function listMyWarningsAction(): Promise<{
  warnings?: WorkflowWarning[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_warnings')
    .select('*')
    .eq('sent_to', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { error: error.message };
  return { warnings: (data ?? []) as WorkflowWarning[] };
}
