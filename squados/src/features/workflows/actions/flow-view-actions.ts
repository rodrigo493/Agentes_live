'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface FlowStepView {
  template_step_id: string;
  step_order: number;
  title: string;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  assignee_label: string | null;
  sla_hours: number;
  running_count: number;
  overdue_count: number;
  blocked_count: number;
}

export interface FlowInstanceAtStep {
  instance_id: string;
  reference: string;
  title: string | null;
  started_at: string;
  step_id: string;
  step_status: string;
  due_at: string | null;
  assignee_name: string | null;
  is_overdue: boolean;
}

export interface FlowView {
  template_id: string;
  template_name: string;
  description: string | null;
  color: string;
  steps: FlowStepView[];
  // Somente para usuário não-admin: quais step_orders o usuário participa
  user_step_orders: number[];
}

export async function getFlowsViewAction(): Promise<{
  flows?: FlowView[];
  isAdmin: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: tmpls, error: eT } = await admin
    .from('workflow_templates')
    .select('id, name, description, color, workflow_template_steps(id, step_order, title, assignee_user_id, assignee_sector_id, sla_hours)')
    .eq('is_active', true)
    .order('name');
  if (eT) return { isAdmin, error: eT.message };

  const allTemplateIds = (tmpls ?? []).map((t) => t.id);
  if (allTemplateIds.length === 0) return { isAdmin, flows: [] };

  // Buscar todas as instâncias running e steps atuais
  const { data: runningSteps } = await admin
    .from('workflow_steps')
    .select('id, instance_id, template_step_id, step_order, status, due_at, assignee_id, instance:workflow_instances!workflow_steps_instance_id_fkey!inner(template_id, status)')
    .in('status', ['in_progress', 'blocked', 'overdue']);

  const stepsByTemplateStep = new Map<string, { running: number; overdue: number; blocked: number }>();
  for (const rs of runningSteps ?? []) {
    const inst = Array.isArray(rs.instance) ? rs.instance[0] : rs.instance;
    if (!inst || inst.status !== 'running') continue;
    const key = rs.template_step_id;
    const bucket = stepsByTemplateStep.get(key) ?? { running: 0, overdue: 0, blocked: 0 };
    bucket.running += 1;
    if (rs.status === 'overdue') bucket.overdue += 1;
    if (rs.status === 'blocked') bucket.blocked += 1;
    stepsByTemplateStep.set(key, bucket);
  }

  // Buscar profiles/sectors para labels
  const { data: allSectors } = await admin.from('sectors').select('id, name');
  const { data: allUsers }   = await admin.from('profiles').select('id, full_name');
  const sectorMap = new Map((allSectors ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const userMap   = new Map((allUsers   ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]));

  const flows: FlowView[] = (tmpls ?? []).map((t) => {
    const rawSteps = (t.workflow_template_steps ?? []) as Array<{
      id: string; step_order: number; title: string;
      assignee_user_id: string | null; assignee_sector_id: string | null;
      sla_hours: number;
    }>;
    const orderedSteps = [...rawSteps].sort((a, b) => a.step_order - b.step_order);
    const userStepOrders: number[] = [];

    const steps: FlowStepView[] = orderedSteps.map((s) => {
      const counts = stepsByTemplateStep.get(s.id) ?? { running: 0, overdue: 0, blocked: 0 };
      const label = s.assignee_user_id
        ? userMap.get(s.assignee_user_id) ?? null
        : s.assignee_sector_id
          ? sectorMap.get(s.assignee_sector_id) ?? null
          : null;

      const isUsers = s.assignee_user_id === user.id
        || (s.assignee_sector_id != null && profile.sector_id === s.assignee_sector_id);
      if (isUsers) userStepOrders.push(s.step_order);

      return {
        template_step_id: s.id,
        step_order: s.step_order,
        title: s.title,
        assignee_user_id: s.assignee_user_id,
        assignee_sector_id: s.assignee_sector_id,
        assignee_label: label,
        sla_hours: Number(s.sla_hours),
        running_count: counts.running,
        overdue_count: counts.overdue,
        blocked_count: counts.blocked,
      };
    });

    return {
      template_id: t.id,
      template_name: t.name,
      description: t.description,
      color: t.color,
      steps,
      user_step_orders: userStepOrders,
    };
  });

  // Se não é admin, remover fluxos em que o usuário não participa
  const filtered = isAdmin ? flows : flows.filter((f) => f.user_step_orders.length > 0);

  return { isAdmin, flows: filtered };
}

export async function getInstancesAtStepAction(
  templateStepId: string
): Promise<{ instances?: FlowInstanceAtStep[]; error?: string }> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('workflow_steps')
    .select(`
      id, instance_id, status, due_at, assignee_id,
      instance:workflow_instances!workflow_steps_instance_id_fkey!inner(reference, title, started_at, status),
      assignee:profiles!workflow_steps_assignee_id_fkey(full_name)
    `)
    .eq('template_step_id', templateStepId)
    .in('status', ['in_progress', 'blocked', 'overdue'])
    .order('due_at', { nullsFirst: false });

  if (error) return { error: error.message };

  const now = Date.now();
  const instances: FlowInstanceAtStep[] = (data ?? [])
    .map((r) => {
      const inst = Array.isArray(r.instance) ? r.instance[0] : r.instance;
      const asg  = Array.isArray(r.assignee) ? r.assignee[0] : r.assignee;
      if (!inst || inst.status !== 'running') return null;
      const dueMs = r.due_at ? new Date(r.due_at).getTime() : 0;
      return {
        instance_id: r.instance_id,
        reference: inst.reference,
        title: inst.title,
        started_at: inst.started_at,
        step_id: r.id,
        step_status: r.status,
        due_at: r.due_at,
        assignee_name: asg?.full_name ?? null,
        is_overdue: dueMs > 0 && dueMs < now,
      } as FlowInstanceAtStep;
    })
    .filter(Boolean) as FlowInstanceAtStep[];

  return { instances };
}
