'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkflowInboxItem } from '@/shared/types/database';

export async function getMyInboxAction(): Promise<{
  items?: WorkflowInboxItem[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('workflow_inbox_items')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['pending', 'in_progress', 'blocked', 'overdue'])
    .order('due_at');

  if (error) return { error: error.message };
  return { items: (data ?? []) as WorkflowInboxItem[] };
}
