import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createWorkflowInstance } from '@/features/workflows/lib/create-workflow-instance';

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const apiKey = req.headers.get('x-api-key') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : apiKey;

  if (!SECRET || token !== SECRET) return json({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { reference, url, notes } = body as {
    reference?: string;
    url?: string;
    notes?: string;
  };

  if (!reference?.trim()) return json({ error: 'reference é obrigatório' }, 400);

  const ref = reference.trim();
  const title = url ? `${ref} — ${url.trim()}` : ref;

  const admin = createAdminClient();

  const { data: templates, error: tplErr } = await admin
    .from('workflow_templates')
    .select('id, name')
    .ilike('name', '%Gerar OP%')
    .eq('is_active', true)
    .limit(1);

  if (tplErr) return json({ error: 'Erro interno ao buscar template' }, 500);

  if (!templates || templates.length === 0) {
    console.warn('[gerar-op] nenhum template "Gerar OP" ativo — ignorando', { ref });
    return json({ ignored: true, reason: 'no_template' });
  }

  const templateId = templates[0].id;

  const { data: existing } = await admin
    .from('workflow_instances')
    .select('id, metadata')
    .eq('template_id', templateId)
    .eq('reference', ref)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    const currentMeta = (existing[0].metadata as Record<string, unknown>) ?? {};
    const currentNotes = typeof currentMeta.notes === 'string' ? currentMeta.notes : '';
    const newNotes = notes?.trim()
      ? (currentNotes ? `${currentNotes}\n${notes.trim()}` : notes.trim())
      : currentNotes;

    // `url` é uma string simples (ex: link do pedido); não confundir com o padrão
    // posvenda.url — aqui é apenas um campo de texto livre armazenado no metadata.
    const { error: mergeErr } = await admin
      .from('workflow_instances')
      .update({ metadata: { ...currentMeta, notes: newNotes, ...(url ? { url } : {}) } })
      .eq('id', existing[0].id);

    if (mergeErr) {
      console.error('[gerar-op] erro ao fazer merge nas notes:', mergeErr.message);
    }

    return json({ merged: true, instance_id: existing[0].id, reference: ref });
  }

  const { data: created, error: createErr } = await createWorkflowInstance(admin, {
    templateId,
    reference: ref,
    title,
    startedBy: null,
  });

  if (createErr || !created) {
    console.error('[gerar-op] create instance error:', createErr);
    return json({ error: createErr ?? 'Falha ao criar instância' }, 500);
  }

  if (notes?.trim() || url) {
    await admin
      .from('workflow_instances')
      .update({ metadata: { ...(url ? { url } : {}), ...(notes?.trim() ? { notes: notes.trim() } : {}) } })
      .eq('id', created.instance_id);
  }

  console.info('[gerar-op] criado', { ref, instanceId: created.instance_id });

  return json({
    success: true,
    instance_id: created.instance_id,
    reference: ref,
    template_name: templates[0].name,
  });
}
