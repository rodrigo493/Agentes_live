'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface BlockAnalyticsRow {
  code: string;
  label: string;
  category: string;
  sector_id: string | null;
  sector_name: string | null;
  occurrences: number;
  avg_hours_blocked: number | null;
  first_at: string;
  last_at: string;
}

export interface WorkflowKpis {
  instances_started: number;
  instances_completed: number;
  steps_overdue_now: number;
  steps_blocked_now: number;
  warnings_sent: number;
  avg_step_hours: number | null;
}

async function requireAdmin() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    throw new Error('Apenas admin ou Presidente');
  }
}

export async function getBlockAnalyticsAction(): Promise<{
  rows?: BlockAnalyticsRow[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('workflow_block_analytics')
      .select('*')
      .order('occurrences', { ascending: false });
    if (error) return { error: error.message };
    return { rows: (data ?? []) as BlockAnalyticsRow[] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function getWorkflowKpisAction(): Promise<{
  kpis?: WorkflowKpis;
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.from('workflow_kpis_30d').select('*').single();
    if (error) return { error: error.message };
    return { kpis: data as WorkflowKpis };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface OverdueByWeek {
  week: string;
  week_label: string;
  count: number;
}

export async function getOverdueByWeekAction(): Promise<{
  rows?: OverdueByWeek[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('workflow_steps')
      .select('due_at, status')
      .in('status', ['in_progress', 'blocked'])
      .not('due_at', 'is', null)
      .gte('due_at', new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('due_at');

    if (error) return { error: error.message };

    const byWeek: Record<string, { count: number; start: Date }> = {};

    for (const s of data ?? []) {
      const d = new Date(s.due_at!);
      const isLate = d.getTime() < Date.now();
      if (!isLate) continue;

      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);

      if (!byWeek[key]) byWeek[key] = { count: 0, start: monday };
      byWeek[key].count++;
    }

    const rows: OverdueByWeek[] = Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { count, start }]) => {
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return { week: key, week_label: `${fmt(start)}–${fmt(end)}`, count };
      });

    return { rows };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
