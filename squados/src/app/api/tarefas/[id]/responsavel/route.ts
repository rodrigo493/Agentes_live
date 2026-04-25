import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id_do_responsavel } = await req.json();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tarefas')
    .update({ id_do_responsavel: id_do_responsavel ?? null })
    .eq('id', id)
    .select('id, titulo, id_do_responsavel')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tarefa: data });
}
