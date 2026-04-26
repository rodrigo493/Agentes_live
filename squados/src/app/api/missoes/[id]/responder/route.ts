import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resposta: string = body.resposta?.trim() ?? '';
  if (!resposta) return NextResponse.json({ error: 'resposta obrigatória' }, { status: 400 });

  const admin = createAdminClient();

  // Busca a missão e o workflow atual
  const { data: missao, error: missaoErr } = await admin
    .from('missoes')
    .select('id, descricao, workflows(id, status)')
    .eq('id', id)
    .single();

  if (missaoErr || !missao) return NextResponse.json({ error: 'Missão não encontrada' }, { status: 404 });

  const workflow = (missao.workflows as { id: string; status: string }[])?.[0];

  // Appenda a resposta do Rodrigo à descrição da missão
  const novaDescricao = `${missao.descricao}\n\n---\n## Resposta do Rodrigo\n${resposta}`;

  await Promise.all([
    // Atualiza descrição com a resposta
    admin.from('missoes').update({ descricao: novaDescricao }).eq('id', id),
    // Devolve o workflow para Rascunho se estava aguardando
    ...(workflow?.status === 'Aguardando Aprovação'
      ? [admin.from('workflows').update({ status: 'Rascunho' }).eq('id', workflow.id)]
      : []),
  ]);

  // Dispara a Orquestradora para replanejar com o novo contexto
  const plannerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orquestradora-planner`;
  fetch(plannerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.WORKFLOW_API_KEY ?? '',
    },
    body: JSON.stringify({}),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
