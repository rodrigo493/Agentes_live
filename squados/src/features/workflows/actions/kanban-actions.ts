// squados/src/features/workflows/actions/kanban-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkItemView, StepNote } from './pasta-actions';

export interface KanbanColumn {
  template_step_id: string;
  template_id: string;
  step_order: number;
  step_title: string;
  sla_hours: number;
  assignee_name: string | null;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
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

type RawStepRow = {
  id: string;
  instance_id: string;
  status: string;
  due_at: string | null;
  started_at: string | null;
  assignee_id: string;
  notes: unknown;
  instance: unknown;
  template_step: unknown;
};

type TplStepRow = {
  id: string;
  step_order: number;
  title: string;
  sla_hours: number;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  color: string | null;
  workflow_template_steps: TplStepRow[];
};

function mapRowToItem(
  s: RawStepRow,
  tplStepsByTemplate: Map<string, TplStepRow[]>,
  assigneeMap: Map<string, string>,
): WorkItemView | null {
  const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
  if (!inst || (inst as { status: string }).status !== 'running') return null;
  const instTyped = inst as { reference: string; title: string | null; template_id: string; template: unknown };
  const tmpl = Array.isArray(instTyped.template) ? instTyped.template[0] : instTyped.template;
  if (!tmpl) return null;
  const tmplTyped = tmpl as { id: string; name: string; color: string | null };
  const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
  if (!tplStep) return null;
  const tplStepTyped = tplStep as { id: string; step_order: number; title: string; sla_hours: number };
  const tplSteps = tplStepsByTemplate.get(instTyped.template_id) ?? [];
  const nextTs = tplSteps.find((ts) => ts.step_order === tplStepTyped.step_order + 1) ?? null;
  return {
    step_id: s.id,
    instance_id: s.instance_id,
    reference: instTyped.reference,
    title: instTyped.title ?? null,
    template_id: instTyped.template_id,
    template_name: tmplTyped.name,
    template_color: tmplTyped.color ?? '#6366f1',
    step_title: tplStepTyped.title,
    step_order: tplStepTyped.step_order,
    sla_hours: Number(tplStepTyped.sla_hours),
    assignee_id: s.assignee_id,
    assignee_name: assigneeMap.get(s.assignee_id) ?? null,
    started_at: s.started_at ?? null,
    due_at: s.due_at ?? null,
    status: s.status,
    notes: (s.notes as StepNote[]) ?? [],
    next_step_title: nextTs?.title ?? null,
    next_assignee_id: nextTs?.assignee_user_id ?? null,
  };
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

  const { data: allTplSteps, error: tplStepsErr } = await admin
    .from('workflow_template_steps')
    .select('id, template_id, step_order, title, sla_hours, assignee_user_id, assignee_sector_id')
    .in('template_id', templateIds)
    .order('step_order');
  if (tplStepsErr) return { isAdmin, error: tplStepsErr.message };

  const tplStepsByTemplate = new Map<string, typeof allTplSteps>();
  for (const ts of allTplSteps ?? []) {
    if (!ts.template_id) continue;
    const arr = tplStepsByTemplate.get(ts.template_id) ?? [];
    arr.push(ts);
    tplStepsByTemplate.set(ts.template_id, arr);
  }

  const userAssigneeMap = new Map<string, string>();
  userAssigneeMap.set(user.id, profile.full_name ?? '');

  const items: WorkItemView[] = (steps ?? [])
    .map((s) => mapRowToItem(s as RawStepRow, tplStepsByTemplate, userAssigneeMap))
    .filter((item): item is WorkItemView => item !== null);

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
      .select('id, name, color, workflow_template_steps(id, step_order, title, sla_hours, assignee_user_id, assignee_sector_id)')
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
    ((templates as TemplateRow[]) ?? []).flatMap((t) =>
      (t.workflow_template_steps ?? [])
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

  const tplStepsByTemplate = new Map<string, TplStepRow[]>();
  for (const t of (templates as TemplateRow[]) ?? []) {
    const ts = (t.workflow_template_steps ?? [])
      .sort((a, b) => a.step_order - b.step_order);
    tplStepsByTemplate.set(t.id, ts);
  }

  // Buscar nomes dos responsáveis reais de cada workflow_step
  const stepAssigneeIds = [...new Set(
    (steps ?? []).map((s) => (s as RawStepRow).assignee_id).filter(Boolean),
  )] as string[];
  const allAssigneeIds = [...new Set([...assigneeIds, ...stepAssigneeIds])];
  const fullAssigneeMap = new Map<string, string>(assigneeMap);
  if (allAssigneeIds.length > assigneeIds.length) {
    const missingIds = stepAssigneeIds.filter((id) => !fullAssigneeMap.has(id));
    if (missingIds.length > 0) {
      const { data: extraProfiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', missingIds);
      for (const p of extraProfiles ?? []) fullAssigneeMap.set(p.id, p.full_name ?? '');
    }
  }

  // Montar WorkItemViews
  const allItems: WorkItemView[] = (steps ?? [])
    .map((s) => mapRowToItem(s as RawStepRow, tplStepsByTemplate, fullAssigneeMap))
    .filter((item): item is WorkItemView => item !== null);

  const stats: KanbanStats = { total: 0, overdue: 0, warning: 0, ok: 0 };
  const now = Date.now();

  const flows: KanbanFlow[] = ((templates as TemplateRow[]) ?? []).map((t) => {
    const tplSteps = tplStepsByTemplate.get(t.id) ?? [];
    const templateItems = allItems.filter((i) => i.template_id === t.id);

    const columns: KanbanColumn[] = tplSteps.map((ts) => ({
      template_step_id: ts.id,
      template_id: t.id,
      step_order: ts.step_order,
      step_title: ts.title,
      sla_hours: Number(ts.sla_hours),
      assignee_name: ts.assignee_user_id ? (assigneeMap.get(ts.assignee_user_id) ?? null) : null,
      assignee_user_id: ts.assignee_user_id,
      assignee_sector_id: ts.assignee_sector_id,
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
      template_color: t.color ?? '#6366f1',
      columns,
      overdue_count: overdueCount,
    };
  });

  return { flows, stats };
}
