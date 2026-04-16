'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function hasMyOverdueAction(): Promise<{
  count: number;
  hasOverdue: boolean;
  error?: string;
}> {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const isLeader = profile.role === 'admin' || profile.role === 'master_admin';

    let query = admin
      .from('workflow_steps')
      .select('id', { count: 'exact', head: true })
      .in('status', ['in_progress', 'blocked'])
      .lt('due_at', nowIso);

    if (!isLeader) {
      query = query.eq('assignee_id', user.id);
    }

    const { count, error } = await query;
    if (error) return { count: 0, hasOverdue: false, error: error.message };

    const total = count ?? 0;
    return { count: total, hasOverdue: total > 0 };
  } catch (err) {
    return {
      count: 0,
      hasOverdue: false,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}
