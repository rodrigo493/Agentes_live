import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { intencao, perguntas, respostas } = body as {
    intencao?: string;
    perguntas?: string[];
    respostas?: string[];
  };

  if (!intencao?.trim() || !perguntas?.length || !respostas?.length) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }

  const pares = perguntas
    .map((p, i) => `**${p}**\n${respostas[i] ?? '(sem resposta)'}`)
    .join('\n\n');

  const descricao = `## Intenção\n${intencao}\n\n## Contexto Fornecido\n${pares}`;
  const titulo = intencao.length > 90 ? intencao.slice(0, 90).trimEnd() + '…' : intencao;

  const admin = createAdminClient();

  const [orgResult, agenteResult] = await Promise.all([
    admin.from('organizacoes').select('id').eq('nome', 'Live Equipamentos').single(),
    admin.from('agentes_config').select('id').eq('nome', 'Laivinha Orquestradora').single(),
  ]);

  if (orgResult.error || !orgResult.data) {
    return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 });
  }

  const { data, error } = await admin
    .from('missoes')
    .insert({
      id_da_organizacao: orgResult.data.id,
      id_do_responsavel: agenteResult.data?.id ?? null,
      titulo,
      descricao,
      status: 'Planejamento',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
