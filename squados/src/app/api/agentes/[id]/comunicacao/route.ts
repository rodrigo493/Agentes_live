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

  // Busca o nome do agente para filtrar menções
  const { data: agente } = await admin
    .from('agentes_config')
    .select('nome')
    .eq('id', id)
    .single();

  const nomeAgente = agente?.nome ?? '';

  // Comentários onde o agente é autor
  const { data, error } = await admin
    .from('comentarios_tarefa')
    .select(`
      id,
      conteudo,
      tipo,
      mencoes,
      criado_em,
      tarefas!id_da_tarefa (
        id,
        titulo
      )
    `)
    .eq('id_do_autor', id)
    .order('criado_em', { ascending: false })
    .limit(30);

  // Comentários onde o agente é mencionado (busca por nome)
  const { data: mencoes } = await admin
    .from('comentarios_tarefa')
    .select(`
      id,
      conteudo,
      tipo,
      mencoes,
      criado_em,
      tarefas!id_da_tarefa (
        id,
        titulo
      )
    `)
    .neq('id_do_autor', id)
    .contains('mencoes', [nomeAgente])
    .order('criado_em', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Merge e dedup por id, ordenado por data
  const todos = [...(data ?? []), ...(mencoes ?? [])];
  const uniq = Array.from(new Map(todos.map((c) => [c.id, c])).values())
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
    .slice(0, 30);

  return NextResponse.json({ comentarios: uniq });
}
