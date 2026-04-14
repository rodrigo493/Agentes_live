'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { StepComment } from '@/shared/types/database';

export async function addStepCommentAction(
  stepId: string,
  body: string
): Promise<{ comment?: StepComment; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: step } = await admin
    .from('workflow_steps')
    .select('assignee_id')
    .eq('id', stepId)
    .single();

  if (!step || step.assignee_id !== user.id) {
    return { error: 'Apenas o responsável atual pode comentar nesta etapa' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('step_comments')
    .insert({ step_id: stepId, user_id: user.id, body: body.trim() })
    .select()
    .single();

  if (error) return { error: error.message };
  return { comment: data as StepComment };
}

export async function listStepCommentsAction(stepId: string): Promise<{
  comments?: (StepComment & { user_name: string })[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('step_comments')
    .select('*, user:profiles!step_comments_user_id_fkey(full_name)')
    .eq('step_id', stepId)
    .order('created_at');

  if (error) return { error: error.message };

  const comments = (data ?? []).map((c) => ({
    ...c,
    user_name: (c.user as { full_name: string } | null)?.full_name ?? '(usuário removido)',
  }));

  return { comments };
}
