import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Apenas admin' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: instances, error } = await admin
    .from('workflow_instances')
    .select(`
      id, template_id, reference, title, status, started_by, started_at, current_step_id,
      template:workflow_templates(name, is_active)
    `)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const instanceIds = (instances ?? []).map((i) => i.id);
  const { data: steps } = await admin
    .from('workflow_steps')
    .select('id, instance_id, step_order, status, assignee_id, started_at, due_at')
    .in('instance_id', instanceIds)
    .order('step_order');

  const stepsByInstance = new Map<string, unknown[]>();
  for (const s of steps ?? []) {
    const list = stepsByInstance.get(s.instance_id) ?? [];
    list.push(s);
    stepsByInstance.set(s.instance_id, list);
  }

  return NextResponse.json({
    count: instances?.length ?? 0,
    instances: (instances ?? []).map((i) => ({
      ...i,
      steps: stepsByInstance.get(i.id) ?? [],
    })),
  });
}
