import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createWorkflowInstance } from '@/features/workflows/lib/create-workflow-instance';
import { extractPosVendaFromUrl } from '@/features/workflows/lib/posvenda-client';

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

  const { reference, title: bodyTitle, url, notes } = body as {
    reference?: string;
    title?: string;
    url?: string;
    notes?: string;
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
    .select('id, metadata')
    .eq('template_id', templateId)
    .eq('reference', ref)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    // Merge nas notes da instância existente preservando todos os outros campos do metadata
    if (notes?.trim()) {
      const currentMeta = (existing[0].metadata as Record<string, unknown>) ?? {};
      const posvenda = url ? extractPosVendaFromUrl(url) : null;
      const mergedMeta = {
        ...currentMeta,
        notes: notes.trim(),
        ...(posvenda ? { posvenda: { type: posvenda.type, uuid: posvenda.uuid, url } } : {}),
      };
      await admin
        .from('workflow_instances')
        .update({ metadata: mergedMeta })
        .eq('id', existing[0].id);
    }
    return json({ error: 'Instância ativa já existe para esta referência', reference: ref }, 409);
  }

  const { data: created, error: createErr } = await createWorkflowInstance(admin, {
    templateId,
    reference: ref,
    title,
    startedBy: null,
  });

  if (createErr || !created) {
    console.error('[pos-venda webhook] create instance error:', createErr);
    return json({ error: createErr ?? 'Falha ao criar instância' }, 500);
  }

  // Persiste metadata: UUID do PA/PG + notes (observações enviadas pelo LivePosVenda)
  const posvenda = url ? extractPosVendaFromUrl(url) : null;
  const metadataToSave = {
    ...(posvenda ? { posvenda: { type: posvenda.type, uuid: posvenda.uuid, url } } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  };
  if (Object.keys(metadataToSave).length > 0) {
    await admin
      .from('workflow_instances')
      .update({ metadata: metadataToSave })
      .eq('id', created.instance_id);
  }

  console.info('[pos-venda webhook] criado', {
    ref,
    instanceId: created.instance_id,
    firstStepId: created.first_step_id,
  });

  return json({
    success: true,
    instance_id: created.instance_id,
    reference: ref,
    template_id: templateId,
    template_name: templates[0].name,
    first_step_id: created.first_step_id,
    due_at: created.due_at,
  });
}
