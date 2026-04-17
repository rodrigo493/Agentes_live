'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient } from '@/shared/lib/supabase/server';
import { completeStepAction } from './instance-actions';
import { getOrCreateDMConversation } from '@/features/workspace/actions/workspace-actions';

export interface StepNote {
  author_id: string;
  author_name: string;
  step_title: string;
  text: string;
  created_at: string;
}

export interface WorkItemView {
  step_id: string;
  instance_id: string;
  reference: string;
  title: string | null;
  template_id: string;
  template_name: string;
  template_color: string;
  step_title: string;
  step_order: number;
  sla_hours: number;
  assignee_id: string;
  started_at: string | null;
  due_at: string | null;
  status: string;
  notes: StepNote[];
  next_step_title: string | null;
  next_assignee_id: string | null;
}

export interface PastaView {
  pasta_key: string;
  template_id: string;
  template_name: string;
  template_color: string;
  step_title: string;
  step_order: number;
  items: WorkItemView[];
}

export async function getPastaViewAction(): Promise<{
  pastas?: PastaView[];
  isAdmin: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  let stepsQuery = admin
    .from('workflow_steps')
    .select(`
      id, instance_id, status, due_at, started_at, assignee_id, notes,
      template_step_id,
      instance:workflow_instances!inner(
        id, reference, title, template_id, status,
        template:workflow_templates!inner(id, name, color)
      ),
      template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(
        id, step_order, title, sla_hours
      )
    `)
    .in('status', ['in_progress', 'pending', 'blocked', 'overdue']);

  if (!isAdmin) {
    stepsQuery = stepsQuery.eq('assignee_id', user.id);
  }

  const { data: steps, error } = await stepsQuery;
  if (error) return { isAdmin, error: error.message };

  const templateIds = [...new Set(
    (steps ?? []).map((s) => {
      const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
      return inst?.template_id;
    }).filter(Boolean)
  )] as string[];

  if (templateIds.length === 0) {
    return { isAdmin, pastas: [] };
  }

  const { data: allTplSteps } = await admin
    .from('workflow_template_steps')
    .select('id, template_id, step_order, title, assignee_user_id, assignee_sector_id')
    .in('template_id', templateIds)
    .order('step_order');

  const tplStepsByTemplate = new Map<string, typeof allTplSteps>();
  for (const ts of allTplSteps ?? []) {
    if (!ts.template_id) continue;
    const arr = tplStepsByTemplate.get(ts.template_id) ?? [];
    arr.push(ts);
    tplStepsByTemplate.set(ts.template_id, arr);
  }

  const items: WorkItemView[] = [];
  for (const s of steps ?? []) {
    const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
    if (!inst || inst.status !== 'running') continue;
    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    if (!tmpl) continue;
    const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
    if (!tplStep) continue;

    const tplSteps = tplStepsByTemplate.get(inst.template_id) ?? [];
    const nextTs = tplSteps.find((ts) => ts.step_order === tplStep.step_order + 1) ?? null;

    items.push({
      step_id: s.id,
      instance_id: s.instance_id,
      reference: inst.reference,
      title: inst.title ?? null,
      template_id: inst.template_id,
      template_name: tmpl.name,
      template_color: tmpl.color ?? '#6366f1',
      step_title: tplStep.title,
      step_order: tplStep.step_order,
      sla_hours: Number(tplStep.sla_hours),
      assignee_id: s.assignee_id,
      started_at: s.started_at ?? null,
      due_at: s.due_at ?? null,
      status: s.status,
      notes: (s.notes as StepNote[]) ?? [],
      next_step_title: nextTs?.title ?? null,
      next_assignee_id: nextTs?.assignee_user_id ?? null,
    });
  }

  const pastaMap = new Map<string, PastaView>();
  for (const item of items) {
    const key = `${item.template_id}_${item.step_order}`;
    if (!pastaMap.has(key)) {
      pastaMap.set(key, {
        pasta_key: key,
        template_id: item.template_id,
        template_name: item.template_name,
        template_color: item.template_color,
        step_title: item.step_title,
        step_order: item.step_order,
        items: [],
      });
    }
    pastaMap.get(key)!.items.push(item);
  }

  // Sort pastas: by template name then step_order
  const sorted = Array.from(pastaMap.values()).sort(
    (a, b) => a.template_name.localeCompare(b.template_name) || a.step_order - b.step_order
  );

  return { isAdmin, pastas: sorted };
}

export async function advanceWithNoteAction(
  stepId: string,
  note?: string
): Promise<{ error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: step } = await admin
    .from('workflow_steps')
    .select(`
      id, notes, template_step_id,
      template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title),
      instance:workflow_instances!inner(reference, template_id)
    `)
    .eq('id', stepId)
    .single();

  if (!step) return { error: 'Etapa não encontrada' };

  const tplStep = Array.isArray(step.template_step) ? step.template_step[0] : step.template_step;
  const inst = Array.isArray(step.instance) ? step.instance[0] : step.instance;

  // Complete the step FIRST — only write note if this succeeds
  const { next_step_id, error } = await completeStepAction(stepId);
  if (error) return { error };

  // Now persist the note (step is already completed, note is historical record)
  if (note?.trim()) {
    const currentNotes = (step.notes as StepNote[]) ?? [];
    const newNote: StepNote = {
      author_id: user.id,
      author_name: profile.full_name ?? 'Usuário',
      step_title: tplStep?.title ?? 'Etapa',
      text: note.trim(),
      created_at: new Date().toISOString(),
    };
    const { error: noteError } = await admin
      .from('workflow_steps')
      .update({ notes: [...currentNotes, newNote] })
      .eq('id', stepId);
    if (noteError) {
      // Note failed to persist but step was already advanced — log and continue
      console.error('[advanceWithNoteAction] failed to persist note:', noteError.message);
    }
  }

  if (next_step_id) {
    const { data: nextStep } = await admin
      .from('workflow_steps')
      .select('assignee_id, template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)')
      .eq('id', next_step_id)
      .single();

    const nextAssigneeId = nextStep?.assignee_id;
    const nextTplStep = nextStep
      ? (Array.isArray(nextStep.template_step) ? nextStep.template_step[0] : nextStep.template_step)
      : null;

    if (nextAssigneeId && nextAssigneeId !== user.id) {
      const dmResult = await getOrCreateDMConversation(nextAssigneeId);
      if (dmResult.data?.id) {
        const supabase = await createClient();
        await supabase.from('messages').insert({
          conversation_id: dmResult.data.id,
          sender_id: user.id,
          sender_type: 'user',
          content: `📂 Novo item no seu fluxo: **${inst?.reference ?? 'Item'}** — ${nextTplStep?.title ?? 'próxima etapa'}. Acesse Operações para ver.`,
          content_type: 'text',
        });
      }
    }
  }

  return {};
}

export async function addNoteToStepAction(
  stepId: string,
  noteText: string
): Promise<{ error?: string }> {
  if (!noteText.trim()) return { error: 'Nota não pode ser vazia' };

  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: step } = await admin
    .from('workflow_steps')
    .select('id, notes, assignee_id, template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)')
    .eq('id', stepId)
    .single();

  if (!step) return { error: 'Etapa não encontrada' };

  if (step.assignee_id !== user.id && !isAdmin) {
    return { error: 'Sem permissão para modificar esta etapa' };
  }

  const tplStep = Array.isArray(step.template_step) ? step.template_step[0] : step.template_step;
  const currentNotes = (step.notes as StepNote[]) ?? [];
  const newNote: StepNote = {
    author_id: user.id,
    author_name: profile.full_name ?? 'Usuário',
    step_title: tplStep?.title ?? 'Etapa',
    text: noteText.trim(),
    created_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('workflow_steps')
    .update({ notes: [...currentNotes, newNote] })
    .eq('id', stepId);

  if (error) return { error: error.message };
  return {};
}

export async function createWorkItemAction(data: {
  reference: string;
  title: string;
  template_id: string;
  start_step_order?: number;
  initial_note?: string;
}): Promise<{ instance_id?: string; error?: string }> {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Apenas admin pode criar itens' };
  }

  if (data.start_step_order !== undefined && data.start_step_order !== 1) {
    return { error: 'start_step_order > 1 não é suportado nesta versão' };
  }

  const admin = createAdminClient();

  const { data: tmpl } = await admin
    .from('workflow_templates')
    .select('id')
    .eq('id', data.template_id)
    .eq('is_active', true)
    .single();

  if (!tmpl) return { error: 'Fluxo não encontrado ou inativo' };

  const { data: instanceId, error } = await admin.rpc('start_workflow_instance', {
    p_template_id: data.template_id,
    p_reference: data.reference.trim(),
    p_title: data.title.trim() || null,
  });

  if (error) return { error: error.message };

  if (data.initial_note?.trim() && instanceId) {
    const { data: firstStep } = await admin
      .from('workflow_steps')
      .select('id')
      .eq('instance_id', instanceId as string)
      .order('step_order')
      .limit(1)
      .single();

    if (firstStep) {
      await addNoteToStepAction(firstStep.id, data.initial_note);
    }
  }

  return { instance_id: instanceId as string };
}
