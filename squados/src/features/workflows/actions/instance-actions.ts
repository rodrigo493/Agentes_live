'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkflowInstance, WorkflowStep, WorkflowBlockReason } from '@/shared/types/database';

export async function startInstanceAction(data: {
  template_id: string;
  reference: string;
  title?: string;
}): Promise<{ instance_id?: string; error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { data: id, error } = await supabase.rpc('start_workflow_instance', {
    p_template_id: data.template_id,
    p_reference:   data.reference.trim(),
    p_title:       data.title?.trim() || null,
  });

  if (error) return { error: error.message };
  return { instance_id: id as string };
}

export async function completeStepAction(
  stepId: string,
  payload: Record<string, unknown> = {},
  targetStepTitle?: string,
): Promise<{ next_step_id?: string | null; error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('complete_workflow_step', {
    p_step_id: stepId,
    p_payload: payload,
    p_target_step_title: targetStepTitle ?? null,
  });

  if (error) return { error: error.message };
  return { next_step_id: data as string | null };
}

export async function blockStepAction(
  stepId: string,
  reasonCode: string,
  reasonText?: string
): Promise<{ error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc('block_workflow_step', {
    p_step_id:     stepId,
    p_reason_code: reasonCode,
    p_reason_text: reasonText?.trim() || null,
  });

  if (error) return { error: error.message };
  return {};
}

export async function listMyInstancesAction(): Promise<{
  instances?: (WorkflowInstance & { template_name: string })[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('workflow_instances')
    .select('*, workflow_templates(name)')
    .eq('started_by', user.id)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) return { error: error.message };
  const instances = (data ?? []).map((i) => ({
    ...i,
    template_name: (i.workflow_templates as { name: string } | null)?.name ?? '',
  }));
  return { instances: instances as (WorkflowInstance & { template_name: string })[] };
}

export async function getInstanceStepsAction(instanceId: string): Promise<{
  steps?: WorkflowStep[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_steps')
    .select('*')
    .eq('instance_id', instanceId)
    .order('step_order');
  if (error) return { error: error.message };
  return { steps: (data ?? []) as WorkflowStep[] };
}

export async function listBlockReasonsAction(): Promise<{
  reasons?: WorkflowBlockReason[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_block_reasons')
    .select('*')
    .eq('is_active', true)
    .order('label');
  if (error) return { error: error.message };
  return { reasons: (data ?? []) as WorkflowBlockReason[] };
}

export async function listOverdueStepsAction(): Promise<{
  items?: Array<{
    step_id: string;
    instance_id: string;
    reference: string;
    title: string;
    assignee_name: string | null;
    due_at: string;
    hours_overdue: number;
    status: string;
    block_reason_text: string | null;
    block_reason_code: string | null;
  }>;
  error?: string;
}> {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Apenas CEO/Presidente' };
  }
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('workflow_steps')
    .select(`
      id, instance_id, status, due_at, block_reason_text, block_reason_code,
      assignee:profiles!workflow_steps_assignee_id_fkey(full_name),
      instance:workflow_instances!workflow_steps_instance_id_fkey(reference, title)
    `)
    .in('status', ['in_progress', 'blocked'])
    .lt('due_at', nowIso)
    .order('due_at');

  if (error) return { error: error.message };

  const items = (data ?? []).map((r) => {
    const due = new Date(r.due_at).getTime();
    const hours_overdue = Math.max(0, Math.floor((Date.now() - due) / 3_600_000));
    const instRaw = r.instance as unknown;
    const asgRaw = r.assignee as unknown;
    const inst = (Array.isArray(instRaw) ? instRaw[0] : instRaw) as { reference: string; title: string | null } | null;
    const asg = (Array.isArray(asgRaw) ? asgRaw[0] : asgRaw) as { full_name: string } | null;
    return {
      step_id: r.id,
      instance_id: r.instance_id,
      reference: inst?.reference ?? '',
      title: inst?.title ?? '',
      assignee_name: asg?.full_name ?? null,
      due_at: r.due_at,
      hours_overdue,
      status: r.status,
      block_reason_text: r.block_reason_text,
      block_reason_code: r.block_reason_code,
    };
  });

  return { items };
}
