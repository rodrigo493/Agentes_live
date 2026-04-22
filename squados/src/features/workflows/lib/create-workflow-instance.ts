import type { SupabaseClient } from '@supabase/supabase-js';

interface TemplateStep {
  id: string;
  step_order: number;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  sla_hours: number;
}

interface CreateInput {
  templateId: string;
  reference: string;
  title?: string | null;
  startedBy?: string | null;
}

interface CreateResult {
  instance_id: string;
  first_step_id: string;
  due_at: string | null;
}

export async function createWorkflowInstance(
  admin: SupabaseClient,
  input: CreateInput
): Promise<{ data?: CreateResult; error?: string }> {
  const { templateId, reference, title, startedBy } = input;

  const { data: firstStep, error: tplErr } = await admin
    .from('workflow_template_steps')
    .select('id, step_order, assignee_user_id, assignee_sector_id, sla_hours')
    .eq('template_id', templateId)
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle<TemplateStep>();

  if (tplErr) return { error: tplErr.message };
  if (!firstStep) return { error: 'Template sem etapas' };

  const { data: instance, error: instErr } = await admin
    .from('workflow_instances')
    .insert({
      template_id: templateId,
      reference,
      title: title ?? null,
      started_by: startedBy ?? null,
    })
    .select('id')
    .single();

  if (instErr) return { error: instErr.message };
  const instanceId = instance.id as string;

  let assigneeId: string | null = firstStep.assignee_user_id;
  if (!assigneeId && firstStep.assignee_sector_id) {
    const { data: sectorUser } = await admin
      .from('profiles')
      .select('id')
      .eq('sector_id', firstStep.assignee_sector_id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('full_name')
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (sectorUser) assigneeId = sectorUser.id;
  }

  const startedAt = new Date();
  const dueAt = new Date(startedAt.getTime() + firstStep.sla_hours * 3_600_000);

  const { data: step, error: stepErr } = await admin
    .from('workflow_steps')
    .insert({
      instance_id: instanceId,
      template_step_id: firstStep.id,
      step_order: firstStep.step_order,
      assignee_id: assigneeId,
      assignee_sector_id: firstStep.assignee_sector_id,
      status: 'in_progress',
      started_at: startedAt.toISOString(),
      due_at: dueAt.toISOString(),
    })
    .select('id, due_at')
    .single();

  if (stepErr) return { error: stepErr.message };

  await admin
    .from('workflow_instances')
    .update({ current_step_id: step.id })
    .eq('id', instanceId);

  return {
    data: {
      instance_id: instanceId,
      first_step_id: step.id as string,
      due_at: step.due_at ?? null,
    },
  };
}
