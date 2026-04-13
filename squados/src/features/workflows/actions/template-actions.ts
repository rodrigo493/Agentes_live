'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkflowTemplate, WorkflowTemplateStep, WorkflowTemplateFull } from '@/shared/types/database';

async function requireAdmin() {
  const { user, profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    throw new Error('Apenas administradores podem gerenciar templates');
  }
  return { user, profile };
}

export async function listTemplatesAction(): Promise<{
  templates?: WorkflowTemplateFull[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('workflow_templates')
    .select('*, workflow_template_steps(*)')
    .eq('is_active', true)
    .order('name');

  if (error) return { error: error.message };

  const templates = (data ?? []).map((t) => ({
    ...t,
    steps: ((t.workflow_template_steps ?? []) as WorkflowTemplateStep[])
      .sort((a, b) => a.step_order - b.step_order),
  })) as WorkflowTemplateFull[];

  return { templates };
}

export async function createTemplateAction(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}): Promise<{ template?: WorkflowTemplate; error?: string }> {
  try {
    const { user } = await requireAdmin();
    const admin = createAdminClient();

    const { data: template, error } = await admin
      .from('workflow_templates')
      .insert({
        name:        data.name.trim(),
        description: data.description?.trim() || null,
        color:       data.color || 'violet',
        icon:        data.icon || null,
        created_by:  user.id,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    return { template: template as WorkflowTemplate };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateTemplateAction(
  id: string,
  data: { name?: string; description?: string | null; color?: string; icon?: string | null }
): Promise<{ template?: WorkflowTemplate; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data: t, error } = await admin
      .from('workflow_templates')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { template: t as WorkflowTemplate };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteTemplateAction(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin
      .from('workflow_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function upsertTemplateStepAction(data: {
  id?: string;
  template_id: string;
  step_order: number;
  title: string;
  description?: string | null;
  assignee_user_id?: string | null;
  assignee_sector_id?: string | null;
  sla_hours: number;
}): Promise<{ step?: WorkflowTemplateStep; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    if (data.id) {
      const { data: s, error } = await admin
        .from('workflow_template_steps')
        .update({
          step_order:         data.step_order,
          title:              data.title.trim(),
          description:        data.description?.toString().trim() || null,
          assignee_user_id:   data.assignee_user_id || null,
          assignee_sector_id: data.assignee_sector_id || null,
          sla_hours:          data.sla_hours,
        })
        .eq('id', data.id)
        .select()
        .single();
      if (error) return { error: error.message };
      return { step: s as WorkflowTemplateStep };
    }

    const { data: s, error } = await admin
      .from('workflow_template_steps')
      .insert({
        template_id:        data.template_id,
        step_order:         data.step_order,
        title:              data.title.trim(),
        description:        data.description?.toString().trim() || null,
        assignee_user_id:   data.assignee_user_id || null,
        assignee_sector_id: data.assignee_sector_id || null,
        sla_hours:          data.sla_hours,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { step: s as WorkflowTemplateStep };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteTemplateStepAction(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from('workflow_template_steps').delete().eq('id', id);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
