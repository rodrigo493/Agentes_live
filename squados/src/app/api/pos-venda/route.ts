import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

// Segredo compartilhado com o LivePosVenda
const SECRET = process.env.POS_VENDA_WEBHOOK_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * POST /api/pos-venda
 *
 * Headers:
 *   Authorization: Bearer <POS_VENDA_WEBHOOK_SECRET>
 *   — ou —
 *   x-api-key: <POS_VENDA_WEBHOOK_SECRET>
 *
 * Body:
 *   { "reference": "PA-0042", "url": "https://posvenda.liveuni.com.br/..." }
 *   — ou —
 *   { "reference": "PA-0042", "title": "PA-0042 — https://..." }
 *
 * Comportamento:
 *   - Busca template ILIKE '%Pós Venda%' ativo.
 *   - Se não encontrar → 200 silencioso (conforme spec).
 *   - Cria instância via start_workflow_instance.
 *   - Referência duplicada dentro da mesma instância ativa → retorna 409.
 */
export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  const apiKey = req.headers.get('x-api-key') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : apiKey;

  if (!SECRET || token !== SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Body
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { reference, title: bodyTitle, url } = body as {
    reference?: string;
    title?: string;
    url?: string;
  };

  if (!reference?.trim()) {
    return json({ error: 'reference é obrigatório (ex: PA-0042 ou PG-0015)' }, 400);
  }

  // Constrói o título: pode vir pronto ou ser montado a partir de reference + url
  const ref = reference.trim();
  const title = bodyTitle?.trim()
    || (url ? `${ref} — ${url.trim()}` : ref);

  const admin = createAdminClient();

  // Localiza o template "Pós Venda" ativo
  const { data: templates, error: tplErr } = await admin
    .from('workflow_templates')
    .select('id, name')
    .ilike('name', '%Pós Venda%')
    .eq('is_active', true)
    .limit(1);

  if (tplErr) {
    console.error('[pos-venda webhook] template query error:', tplErr.message);
    return json({ error: 'Erro interno ao buscar template' }, 500);
  }

  // Sem template → ignora silenciosamente conforme spec
  if (!templates || templates.length === 0) {
    console.warn('[pos-venda webhook] nenhum template "Pós Venda" ativo — ignorando', { ref });
    return json({ ignored: true, reason: 'no_template' });
  }

  const templateId = templates[0].id;

  // Verifica duplicata: instância running com mesma referência neste template
  const { data: existing } = await admin
    .from('workflow_instances')
    .select('id')
    .eq('template_id', templateId)
    .eq('reference', ref)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    return json({ error: 'Instância ativa já existe para esta referência', reference: ref }, 409);
  }

  // Cria a instância
  const { data: instanceId, error: rpcErr } = await admin.rpc('start_workflow_instance', {
    p_template_id: templateId,
    p_reference:   ref,
    p_title:       title,
  });

  if (rpcErr) {
    console.error('[pos-venda webhook] start_workflow_instance error:', rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  // Busca a primeira etapa criada
  const { data: firstStep } = await admin
    .from('workflow_steps')
    .select('id, due_at')
    .eq('instance_id', instanceId as string)
    .order('step_order')
    .limit(1)
    .single();

  console.info('[pos-venda webhook] criado', { ref, instanceId, firstStepId: firstStep?.id });

  return json({
    success: true,
    instance_id: instanceId,
    reference: ref,
    template_id: templateId,
    template_name: templates[0].name,
    first_step_id: firstStep?.id ?? null,
    due_at: firstStep?.due_at ?? null,
  });
}
