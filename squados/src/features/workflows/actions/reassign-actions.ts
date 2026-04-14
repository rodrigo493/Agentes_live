'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { StepReassignment } from '@/shared/types/database';

async function requireAdmin() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    throw new Error('Apenas admin ou Presidente');
  }
  return profile;
}

export async function reassignStepAction(
  stepId: string,
  toUserId: string
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const profile = await requireAdmin();

  const { data: step, error: stepErr } = await admin
    .from('workflow_steps')
    .select('id, assignee_id, status')
    .eq('id', stepId)
    .single();

  if (stepErr || !step) return { error: 'Etapa não encontrada' };
  if (!['in_progress', 'blocked'].includes(step.status)) {
    return { error: 'Só é possível reatribuir etapas em andamento ou bloqueadas' };
  }

  const { error: auditErr } = await admin.from('step_reassignments').insert({
    step_id:       stepId,
    from_user_id:  step.assignee_id,
    to_user_id:    toUserId,
    reassigned_by: profile.id,
  });
  if (auditErr) return { error: auditErr.message };

  const { error: updateErr } = await admin
    .from('workflow_steps')
    .update({ assignee_id: toUserId })
    .eq('id', stepId);

  if (updateErr) return { error: updateErr.message };
  return {};
}

export async function listStepReassignmentsAction(stepId: string): Promise<{
  reassignments?: (StepReassignment & {
    from_user_name: string | null;
    to_user_name: string;
    reassigned_by_name: string;
  })[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('step_reassignments')
    .select(`
      *,
      from_user:profiles!step_reassignments_from_user_id_fkey(full_name),
      to_user:profiles!step_reassignments_to_user_id_fkey(full_name),
      reassigned_by_user:profiles!step_reassignments_reassigned_by_fkey(full_name)
    `)
    .eq('step_id', stepId)
    .order('reassigned_at', { ascending: false });

  if (error) return { error: error.message };

  const reassignments = (data ?? []).map((r) => ({
    ...r,
    from_user_name: (r.from_user as { full_name: string } | null)?.full_name ?? null,
    to_user_name: (r.to_user as { full_name: string } | null)?.full_name ?? '(usuário removido)',
    reassigned_by_name: (r.reassigned_by_user as { full_name: string } | null)?.full_name ?? '(usuário removido)',
  }));

  return { reassignments };
}
