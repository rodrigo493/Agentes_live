'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface ProductionProblem {
  id: string;
  description: string;
  client_name: string;
  received_at: string;
  created_at: string;
  assignments: ProblemAssignment[];
}

export interface ProblemAssignment {
  id: string;
  assigned_user_id: string;
  assigned_user_name: string;
  assigned_by: string;
  solution: string | null;
  assigned_at: string;
}

export interface SquadUser {
  id: string;
  full_name: string;
  sector_name: string | null;
}

export async function getProblems(): Promise<{
  problems?: ProductionProblem[];
  isAdmin?: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: assignmentsRaw, error: aErr } = await admin
    .from('problem_assignments')
    .select('id, problem_id, assigned_user_id, assigned_by, solution, assigned_at, profiles!problem_assignments_assigned_user_id_fkey(full_name)');

  if (aErr) {
    console.error('[getProblems] assignments error:', aErr.message);
    return { error: 'Erro ao carregar encaminhamentos' };
  }

  let query = admin
    .from('production_problems')
    .select('id, description, client_name, received_at, created_at')
    .order('received_at', { ascending: false });

  if (!isAdmin) {
    const myProblemIds = (assignmentsRaw ?? [])
      .filter((a) => a.assigned_user_id === user.id)
      .map((a) => a.problem_id);

    if (myProblemIds.length === 0) {
      return { problems: [], isAdmin };
    }
    query = query.in('id', myProblemIds);
  }

  const { data: problems, error: pErr } = await query;

  if (pErr) {
    console.error('[getProblems] problems error:', pErr.message);
    return { error: 'Erro ao carregar problemas' };
  }

  const assignerIds = [...new Set((assignmentsRaw ?? []).map((a) => a.assigned_by))];
  const { data: assigners } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', assignerIds.length > 0 ? assignerIds : ['00000000-0000-0000-0000-000000000000']);

  const assignerMap = Object.fromEntries((assigners ?? []).map((p) => [p.id, p.full_name]));

  const assignmentsByProblem: Record<string, ProblemAssignment[]> = {};
  for (const a of assignmentsRaw ?? []) {
    if (!assignmentsByProblem[a.problem_id]) assignmentsByProblem[a.problem_id] = [];
    const profiles = a.profiles as { full_name: string } | { full_name: string }[] | null;
    const userName = Array.isArray(profiles)
      ? (profiles[0]?.full_name ?? 'Usuário')
      : (profiles?.full_name ?? 'Usuário');
    assignmentsByProblem[a.problem_id].push({
      id: a.id,
      assigned_user_id: a.assigned_user_id,
      assigned_user_name: userName,
      assigned_by: assignerMap[a.assigned_by] ?? 'CEO',
      solution: a.solution,
      assigned_at: a.assigned_at,
    });
  }

  const result: ProductionProblem[] = (problems ?? []).map((p) => ({
    ...p,
    assignments: assignmentsByProblem[p.id] ?? [],
  }));

  return { problems: result, isAdmin };
}

export async function assignProblem(
  problemId: string,
  userIds: string[],
  solution: string
): Promise<{ success?: boolean; error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  if (!isAdmin) return { error: 'Apenas admins podem encaminhar problemas' };
  if (!userIds.length) return { error: 'Selecione ao menos um usuário' };

  const admin = createAdminClient();

  await admin.from('problem_assignments').delete().eq('problem_id', problemId);

  const rows = userIds.map((uid) => ({
    problem_id: problemId,
    assigned_user_id: uid,
    assigned_by: user.id,
    solution: solution.trim() || null,
  }));

  const { error } = await admin.from('problem_assignments').insert(rows);

  if (error) {
    console.error('[assignProblem] error:', error.message);
    return { error: 'Erro ao salvar encaminhamento' };
  }

  return { success: true };
}

export async function getProblemRanking(): Promise<{
  ranking?: Array<{ description: string; count: number }>;
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('production_problems')
    .select('description');

  if (error) return { error: error.message };

  const freq: Record<string, number> = {};
  for (const p of data ?? []) {
    const key = (p.description ?? '').trim();
    if (key) freq[key] = (freq[key] ?? 0) + 1;
  }

  const ranking = Object.entries(freq)
    .map(([description, count]) => ({ description, count }))
    .sort((a, b) => b.count - a.count);

  return { ranking };
}

export async function getSquadUsers(): Promise<{ users?: SquadUser[]; error?: string }> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, sector_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name');

  if (error) {
    console.error('[getSquadUsers] error:', error.message);
    return { error: error.message };
  }

  const sectorIds = [...new Set((data ?? []).map((p) => p.sector_id).filter(Boolean))] as string[];
  const sectorMap: Record<string, string> = {};
  if (sectorIds.length > 0) {
    const { data: sectors } = await admin
      .from('sectors')
      .select('id, name')
      .in('id', sectorIds);
    for (const s of sectors ?? []) sectorMap[s.id] = s.name;
  }

  const users: SquadUser[] = (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name ?? '(sem nome)',
    sector_name: p.sector_id ? (sectorMap[p.sector_id] ?? null) : null,
  }));

  return { users };
}
