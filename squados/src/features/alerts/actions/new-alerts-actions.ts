'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function hasFluxoAlertAction(): Promise<{
  count: number;
  hasAlert: boolean;
  error?: string;
}> {
  try {
    const { user } = await getAuthenticatedUser();
    const admin = createAdminClient();

    const { count, error } = await admin
      .from('workflow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', user.id)
      .is('started_at', null)
      .in('status', ['pending', 'in_progress']);

    if (error) return { count: 0, hasAlert: false, error: error.message };
    const total = count ?? 0;
    return { count: total, hasAlert: total > 0 };
  } catch (err) {
    return {
      count: 0,
      hasAlert: false,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

export async function hasMessageAlertAction(): Promise<{
  count: number;
  hasAlert: boolean;
  error?: string;
}> {
  await getAuthenticatedUser();
  return { count: 0, hasAlert: false };
}

export async function hasEmailAlertAction(): Promise<{
  count: number;
  hasAlert: boolean;
  error?: string;
}> {
  await getAuthenticatedUser();
  return { count: 0, hasAlert: false };
}

export async function markStepOpenedAction(
  stepId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await getAuthenticatedUser();
    const admin = createAdminClient();

    const { data: step, error: fetchError } = await admin
      .from('workflow_steps')
      .select('id, assignee_id, started_at')
      .eq('id', stepId)
      .single();

    if (fetchError) return { ok: false, error: fetchError.message };
    if (!step) return { ok: false, error: 'Step não encontrado' };
    if (step.assignee_id !== user.id) {
      return { ok: false, error: 'Step não pertence ao usuário' };
    }
    if (step.started_at) return { ok: true };

    const { error: updateError } = await admin
      .from('workflow_steps')
      .update({ started_at: new Date().toISOString(), status: 'in_progress' })
      .eq('id', stepId);

    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}
