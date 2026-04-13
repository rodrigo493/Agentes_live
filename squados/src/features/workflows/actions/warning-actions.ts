'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

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
