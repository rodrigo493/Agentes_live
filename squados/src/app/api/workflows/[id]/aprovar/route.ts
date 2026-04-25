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

  const body = await req.json().catch(() => ({}));
  const acao: 'aprovar' | 'rejeitar' = body.acao ?? 'aprovar';

  const novoStatus = acao === 'aprovar' ? 'Aprovado' : 'Rascunho';

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('workflows')
    .update({ status: novoStatus })
    .eq('id', id)
    .select('id, status, id_da_missao')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (acao === 'aprovar') {
    await admin
      .from('missoes')
      .update({ status: 'Em Execução' })
      .eq('id', data.id_da_missao);

    // Dispara o executor em background — não bloqueia a resposta
    const executorUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orquestradora-executor`;
    fetch(executorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.WORKFLOW_API_KEY ?? '',
      },
      body: JSON.stringify({ workflow_id: id }),
    }).catch(() => {});
  }

  return NextResponse.json({ workflow: data });
}
