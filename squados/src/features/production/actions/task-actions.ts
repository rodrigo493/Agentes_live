'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { ProductionTask, ProductionTaskCompletion } from '@/shared/types/database';

// helpers
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

// ── Fetch: tarefas do usuário atual ──────────────────────

export async function getMyTasksAction(): Promise<{
  tasks?: ProductionTask[];
  completions?: ProductionTaskCompletion[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const [{ data: tasks, error: tErr }, { data: completions, error: cErr }] =
    await Promise.all([
      admin
        .from('production_tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .eq('is_active', true)
        .order('scheduled_time', { ascending: true }),
      admin
        .from('production_task_completions')
        .select('*')
        .gte('completion_date', weekStart()),
    ]);

  if (tErr) return { error: tErr.message };
  if (cErr) return { error: cErr.message };

  return {
    tasks: (tasks ?? []) as ProductionTask[],
    completions: (completions ?? []) as ProductionTaskCompletion[],
  };
}

// ── Fetch: tarefas de um usuário específico (admin) ──────

export async function getTasksForUserAction(userId: string): Promise<{
  tasks?: ProductionTask[];
  completions?: ProductionTaskCompletion[];
  error?: string;
}> {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin && profile.id !== userId) return { error: 'Acesso negado' };

  const admin = createAdminClient();

  const [{ data: tasks, error: tErr }, { data: completions, error: cErr }] =
    await Promise.all([
      admin
        .from('production_tasks')
        .select('*')
        .eq('assigned_to', userId)
        .eq('is_active', true)
        .order('scheduled_time', { ascending: true }),
      admin
        .from('production_task_completions')
        .select('*')
        .gte('completion_date', weekStart()),
    ]);

  if (tErr) return { error: tErr.message };
  if (cErr) return { error: cErr.message };

  return {
    tasks: (tasks ?? []) as ProductionTask[],
    completions: (completions ?? []) as ProductionTaskCompletion[],
  };
}

// ── Fetch: stats globais de tarefas (dashboard admin) ────

export interface UserTaskStat {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  totalToday: number;
  completedToday: number;
  overdueToday: number;
}

export async function getAllUsersTaskStatsAction(): Promise<{
  stats?: UserTaskStat[];
  totalTasks: number;
  totalCompleted: number;
  totalOverdue: number;
  usersWithNoTasks: number;
  error?: string;
}> {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin) return { totalTasks: 0, totalCompleted: 0, totalOverdue: 0, usersWithNoTasks: 0, error: 'Acesso negado' };

  const admin = createAdminClient();
  const today = todayIso();
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayDay = now.getDay();

  const [{ data: users }, { data: allTasks }, { data: allCompletions }] =
    await Promise.all([
      admin.from('profiles').select('id, full_name, avatar_url').eq('status', 'active').is('deleted_at', null),
      admin.from('production_tasks').select('*').eq('is_active', true),
      admin.from('production_task_completions').select('*').eq('completion_date', today),
    ]);

  if (!users || !allTasks) return { totalTasks: 0, totalCompleted: 0, totalOverdue: 0, usersWithNoTasks: 0 };

  let totalTasks = 0;
  let totalCompleted = 0;
  let totalOverdue = 0;
  let usersWithNoTasks = 0;

  const stats: UserTaskStat[] = users.map((u) => {
    const userTasks = (allTasks as ProductionTask[]).filter((t) => {
      if (t.assigned_to !== u.id) return false;
      if (t.frequency === 'daily') return true;
      if (t.frequency === 'weekly') return t.scheduled_day === todayDay;
      if (t.frequency === 'once') return t.scheduled_date === today;
      return false;
    });

    const completedIds = new Set(
      (allCompletions ?? [])
        .filter((c) => userTasks.some((t) => t.id === c.task_id))
        .map((c) => c.task_id)
    );

    const overdueCount = userTasks.filter(
      (t) => !completedIds.has(t.id) && t.scheduled_time.slice(0, 5) < nowTime
    ).length;

    totalTasks += userTasks.length;
    totalCompleted += completedIds.size;
    totalOverdue += overdueCount;
    if (userTasks.length === 0) usersWithNoTasks++;

    return {
      userId: u.id,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      totalToday: userTasks.length,
      completedToday: completedIds.size,
      overdueToday: overdueCount,
    };
  });

  return { stats, totalTasks, totalCompleted, totalOverdue, usersWithNoTasks };
}

// ── Create ────────────────────────────────────────────────

export async function createTaskAction(data: {
  title: string;
  description?: string;
  assigned_to?: string;
  frequency: 'once' | 'daily' | 'weekly';
  scheduled_time: string;
  scheduled_day?: number;
  scheduled_date?: string;
}): Promise<{ task?: ProductionTask; error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  const assignedTo = isAdmin ? (data.assigned_to ?? user.id) : user.id;

  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from('production_tasks')
    .insert({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      assigned_to: assignedTo,
      created_by: user.id,
      frequency: data.frequency,
      scheduled_time: data.scheduled_time,
      scheduled_day: data.frequency === 'weekly' ? (data.scheduled_day ?? 1) : null,
      scheduled_date: data.frequency === 'once' ? (data.scheduled_date ?? null) : null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { task: task as ProductionTask };
}

// ── Update ────────────────────────────────────────────────

export async function updateTaskAction(
  id: string,
  data: {
    title?: string;
    description?: string;
    frequency?: 'once' | 'daily' | 'weekly';
    scheduled_time?: string;
    scheduled_day?: number;
    scheduled_date?: string;
  }
): Promise<{ task?: ProductionTask; error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  // Verify ownership or admin
  const { data: existing } = await admin
    .from('production_tasks')
    .select('assigned_to')
    .eq('id', id)
    .single();
  if (!existing) return { error: 'Tarefa não encontrada' };
  if (!isAdmin && existing.assigned_to !== user.id) return { error: 'Acesso negado' };

  const { data: task, error } = await admin
    .from('production_tasks')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { task: task as ProductionTask };
}

// ── Delete (soft) ─────────────────────────────────────────

export async function deleteTaskAction(id: string): Promise<{ error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('production_tasks')
    .select('assigned_to')
    .eq('id', id)
    .single();
  if (!existing) return { error: 'Tarefa não encontrada' };
  if (!isAdmin && existing.assigned_to !== user.id) return { error: 'Acesso negado' };

  const { error } = await admin
    .from('production_tasks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

// ── Complete / Uncomplete ─────────────────────────────────

export async function completeTaskAction(
  taskId: string
): Promise<{ completion?: ProductionTaskCompletion; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();
  const today = todayIso();

  const { data, error } = await admin
    .from('production_task_completions')
    .upsert({ task_id: taskId, completion_date: today, completed_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  return { completion: data as ProductionTaskCompletion };
}

export async function uncompleteTaskAction(
  taskId: string
): Promise<{ error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();
  const today = todayIso();

  const query = admin
    .from('production_task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('completion_date', today);

  if (!isAdmin) query.eq('completed_by', user.id);

  const { error } = await query;
  if (error) return { error: error.message };
  return {};
}

// ── Make Recurring (once → daily|weekly) ─────────────────

export async function makeRecurringAction(
  taskId: string,
  newFrequency: 'daily' | 'weekly',
  scheduledDay?: number
): Promise<{ task?: ProductionTask; error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('production_tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .single();
  if (!existing) return { error: 'Tarefa não encontrada' };
  if (!isAdmin && existing.assigned_to !== user.id) return { error: 'Acesso negado' };

  const { data: task, error } = await admin
    .from('production_tasks')
    .update({
      frequency: newFrequency,
      scheduled_date: null,
      scheduled_day: newFrequency === 'weekly' ? (scheduledDay ?? 1) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { task: task as ProductionTask };
}
