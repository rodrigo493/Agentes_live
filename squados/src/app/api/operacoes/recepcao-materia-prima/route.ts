import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin' && profile.role !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin
    .from('organizacoes')
    .select('id')
    .limit(1)
    .single();

  if (!org) return NextResponse.json({ recepcoes: [] });

  const { data, error } = await admin
    .from('recepcao_mercadorias')
    .select('*')
    .eq('id_da_organizacao', org.id)
    .not('etapa', 'in', '(concluido,cancelado)')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recepcoes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { profile, user } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin' && profile.role !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    nf_numero,
    fornecedor,
    valor_total,
    pedido_compra_nomus,
    observacoes,
    id_workflow_step,
    id_workflow_instance,
  } = body as {
    nf_numero?: string;
    fornecedor?: string;
    valor_total?: number;
    pedido_compra_nomus?: string;
    observacoes?: string;
    id_workflow_step?: string;
    id_workflow_instance?: string;
  };

  if (!nf_numero?.trim()) return NextResponse.json({ error: 'nf_numero obrigatório' }, { status: 400 });
  if (!fornecedor?.trim()) return NextResponse.json({ error: 'fornecedor obrigatório' }, { status: 400 });
  if (!valor_total || valor_total <= 0) return NextResponse.json({ error: 'valor_total inválido' }, { status: 400 });

  const admin = createAdminClient();

  const [orgResult, agenteResult] = await Promise.all([
    admin.from('organizacoes').select('id').limit(1).single(),
    admin.from('agentes_config').select('id').or('nome.ilike.%Opera%,nome.ilike.%friday%').limit(1).single(),
  ]);

  if (!orgResult.data) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 });
  const orgId = orgResult.data.id;

  // Inserir na tabela de recepções
  const { data: recepcao, error: errRecepcao } = await admin
    .from('recepcao_mercadorias')
    .insert({
      id_da_organizacao: orgId,
      etapa: 'conferencia',
      nf_numero: nf_numero.trim(),
      fornecedor: fornecedor.trim(),
      valor_total,
      pedido_compra_nomus: pedido_compra_nomus?.trim() ?? null,
      observacoes: observacoes?.trim() ?? null,
      id_workflow_step: id_workflow_step ?? null,
      id_workflow_instance: id_workflow_instance ?? null,
      registrado_por_id: user.id,
      registrado_por_nome: profile.full_name ?? user.email ?? 'Usuário',
    })
    .select('id')
    .single();

  if (errRecepcao) return NextResponse.json({ error: errRecepcao.message }, { status: 500 });

  // Registrar em eventos_autonomos para Friday processar
  const { data: evento, error: errEvento } = await admin
    .from('eventos_autonomos')
    .insert({
      id_da_organizacao: orgId,
      id_do_agente: agenteResult.data?.id ?? null,
      agente_nome: 'Friday',
      tipo: 'recepcao_materia_prima',
      severidade: 'info',
      workflow_ref: nf_numero.trim(),
      step_titulo: 'Recepção de Mercadorias',
      titulo: `Recepção NF ${nf_numero.trim()} — ${fornecedor.trim()}`,
      descricao: `Valor: R$ ${valor_total}${pedido_compra_nomus ? ` | PC: ${pedido_compra_nomus}` : ''}`,
      dados: {
        nf_numero: nf_numero.trim(),
        fornecedor: fornecedor.trim(),
        valor_total,
        pedido_compra_nomus: pedido_compra_nomus?.trim() ?? null,
        observacoes: observacoes?.trim() ?? null,
        id_workflow_step: id_workflow_step ?? null,
        id_workflow_instance: id_workflow_instance ?? null,
        recepcao_id: recepcao!.id,
        registrado_por: profile.full_name ?? user.email ?? 'Usuário',
        registrado_em: new Date().toISOString(),
      },
      status: 'pendente',
    })
    .select('id')
    .single();

  if (errEvento) return NextResponse.json({ error: errEvento.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    recepcao_id: recepcao!.id,
    evento_id: evento!.id,
  });
}
