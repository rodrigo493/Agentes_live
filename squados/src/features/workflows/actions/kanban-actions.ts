// squados/src/features/workflows/actions/kanban-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkItemView, StepNote } from './pasta-actions';

export interface KanbanColumn {
  step_order: number;
  step_title: string;
  sla_hours: number;
  assignee_name: string | null;
  items: WorkItemView[];
}

export interface KanbanFlow {
  template_id: string;
  template_name: string;
  template_color: string;
  columns: KanbanColumn[];
  overdue_count: number;
}

export interface KanbanStats {
  total: number;
  overdue: number;
  warning: number;
  ok: number;
}

// Usuário: só etapas onde ele é responsável, agrupadas por template → step_order
export async function getUserKanbanAction(): Promise<{
  flows?: KanbanFlow[];
  isAdmin: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: steps, error } = await admin
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
    .eq('assignee_id', user.id)
    .in('status', ['in_progress', 'pending', 'blocked', 'overdue']);

  if (error) return { isAdmin, error: error.message };

  const templateIds = [...new Set(
    (steps ?? []).map((s) => {
      const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
      return inst?.template_id;
    }).filter(Boolean),
  )] as string[];

  if (templateIds.length === 0) return { isAdmin, flows: [] };

  const { data: allTplSteps } = await admin
    .from('workflow_template_steps')
    .select('id, template_id, step_order, title, sla_hours, assignee_user_id')
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

  const flowMap = new Map<string, KanbanFlow>();
  const now = Date.now();

  for (const item of items) {
    if (!flowMap.has(item.template_id)) {
      flowMap.set(item.template_id, {
        template_id: item.template_id,
        template_name: item.template_name,
        template_color: item.template_color,
        columns: [],
        overdue_count: 0,
      });
    }
    const flow = flowMap.get(item.template_id)!;
    let col = flow.columns.find((c) => c.step_order === item.step_order);
    if (!col) {
      col = {
        step_order: item.step_order,
        step_title: item.step_title,
        sla_hours: item.sla_hours,
        assignee_name: null,
        items: [],
      };
      flow.columns.push(col);
      flow.columns.sort((a, b) => a.step_order - b.step_order);
    }
    col.items.push(item);
    if (item.due_at && new Date(item.due_at).getTime() < now) {
      flow.overdue_count++;
    }
  }

  return { isAdmin, flows: Array.from(flowMap.values()) };
}

// Admin: todos os templates com TODAS as colunas (inclusive vazias) + todos os itens
export async function getAdminKanbanAction(): Promise<{
  flows?: KanbanFlow[];
  stats?: KanbanStats;
  error?: string;
}> {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Acesso restrito a admins' };
  }
  const admin = createAdminClient();

  const [{ data: templates }, { data: steps, error: stepsErr }] = await Promise.all([
    admin
      .from('workflow_templates')
      .select('id, name, color, workflow_template_steps(id, step_order, title, sla_hours, assignee_user_id)')
      .eq('is_active', true)
      .order('name'),
    admin
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
      .in('status', ['in_progress', 'pending', 'blocked', 'overdue']),
  ]);

  if (stepsErr) return { error: stepsErr.message };

  // Buscar nomes dos responsáveis padrão de cada template_step
  const assigneeIds = [...new Set(
    (templates ?? []).flatMap((t) =>
      ((t.workflow_template_steps as Array<{ assignee_user_id: string | null }>) ?? [])
        .map((s) => s.assignee_user_id)
        .filter(Boolean),
    ),
  )] as string[];

  const assigneeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', assigneeIds);
    for (const p of profiles ?? []) assigneeMap.set(p.id, p.full_name ?? '');
  }

  type TplStepRow = { id: string; step_order: number; title: string; sla_hours: number; assignee_user_id: string | null };
  const tplStepsByTemplate = new Map<string, TplStepRow[]>();
  for (const t of templates ?? []) {
    const ts = ((t.workflow_template_steps as TplStepRow[]) ?? [])
      .sort((a, b) => a.step_order - b.step_order);
    tplStepsByTemplate.set(t.id, ts);
  }

  // Montar WorkItemViews
  const allItems: WorkItemView[] = [];
  for (const s of steps ?? []) {
    const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
    if (!inst || inst.status !== 'running') continue;
    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    if (!tmpl) continue;
    const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
    if (!tplStep) continue;

    const tplSteps = tplStepsByTemplate.get(inst.template_id) ?? [];
    const nextTs = tplSteps.find((ts) => ts.step_order === tplStep.step_order + 1) ?? null;

    allItems.push({
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

  const stats: KanbanStats = { total: 0, overdue: 0, warning: 0, ok: 0 };
  const now = Date.now();

  const flows: KanbanFlow[] = (templates ?? []).map((t) => {
    const tplSteps = tplStepsByTemplate.get(t.id) ?? [];
    const templateItems = allItems.filter((i) => i.template_id === t.id);

    const columns: KanbanColumn[] = tplSteps.map((ts) => ({
      step_order: ts.step_order,
      step_title: ts.title,
      sla_hours: Number(ts.sla_hours),
      assignee_name: ts.assignee_user_id ? (assigneeMap.get(ts.assignee_user_id) ?? null) : null,
      items: templateItems.filter((i) => i.step_order === ts.step_order),
    }));

    const overdueCount = templateItems.filter(
      (i) => i.due_at && new Date(i.due_at).getTime() < now,
    ).length;

    for (const item of templateItems) {
      stats.total++;
      if (!item.due_at) { stats.ok++; continue; }
      const diff = new Date(item.due_at).getTime() - now;
      if (diff < 0) stats.overdue++;
      else if (diff < item.sla_hours * 3_600_000 * 0.3) stats.warning++;
      else stats.ok++;
    }

    return {
      template_id: t.id,
      template_name: t.name,
      template_color: (t as { id: string; name: string; color?: string | null }).color ?? '#6366f1',
      columns,
      overdue_count: overdueCount,
    };
  });

  return { flows, stats };
}
