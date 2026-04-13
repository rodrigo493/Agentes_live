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
