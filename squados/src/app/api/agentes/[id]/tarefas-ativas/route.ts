import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tarefas')
    .select(`
      id,
      titulo,
      status,
      criado_em,
      atualizado_em,
      workflows!id_do_workflow (
        id,
        missoes!id_da_missao (
          id,
          titulo
        )
      )
    `)
    .eq('id_do_responsavel', id)
    .in('status', ['Pendente', 'Em Andamento', 'Em Revisão'])
    .order('atualizado_em', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarefas: data ?? [] });
}
