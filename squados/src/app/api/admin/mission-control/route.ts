import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const [tarefasResult, agentesResult, comentariosResult] = await Promise.all([
    admin
      .from('tarefas')
      .select(`
        id,
        titulo,
        descricao,
        status,
        criado_em,
        atualizado_em,
        id_do_responsavel,
        id_do_entregavel,
        depende_de,
        agentes_config!id_do_responsavel (
          id,
          nome,
          papel
        ),
        workflows!id_do_workflow (
          id,
          missoes!id_da_missao (
            id,
            titulo
          )
        ),
        entregaveis!id_do_entregavel (
          id,
          conteudo,
          formato
        )
      `)
      .order('atualizado_em', { ascending: false })
      .limit(200),

    admin
      .from('agentes_config')
      .select('id, nome, papel')
      .order('nome'),

    admin
      .from('comentarios_tarefa')
      .select(`
        id,
        conteudo,
        tipo,
        mencoes,
        criado_em,
        id_da_tarefa,
        autor_humano,
        agentes_config!id_do_autor (
          id,
          nome,
          papel
        )
      `)
      .order('criado_em', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    tarefas: tarefasResult.data ?? [],
    agentes: agentesResult.data ?? [],
    comentarios: comentariosResult.data ?? [],
  });
}
