import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { titulo, descricao, id_do_responsavel, id_do_workflow } = body as {
    titulo?: string;
    descricao?: string;
    id_do_responsavel?: string;
    id_do_workflow?: string;
  };

  if (!titulo?.trim()) {
    return NextResponse.json({ error: 'Título obrigatório' }, { status: 400 });
  }
  if (!id_do_responsavel) {
    return NextResponse.json({ error: 'Responsável obrigatório' }, { status: 400 });
  }

  const admin = createAdminClient();

  const orgResult = await admin
    .from('organizacoes')
    .select('id')
    .eq('nome', 'Live Equipamentos')
    .single();

  if (!orgResult.data) {
    return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 });
  }

  const { data, error } = await admin
    .from('tarefas')
    .insert({
      id_da_organizacao: orgResult.data.id,
      titulo: titulo.trim(),
      descricao: descricao?.trim() ?? null,
      id_do_responsavel,
      id_do_workflow: id_do_workflow ?? null,
      status: 'Pendente',
    })
    .select('id, titulo')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarefa: data }, { status: 201 });
}
