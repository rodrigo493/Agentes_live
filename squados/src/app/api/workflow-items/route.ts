import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createWorkflowInstance } from '@/features/workflows/lib/create-workflow-instance';

const API_KEY = process.env.WORKFLOW_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!API_KEY || key !== API_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { reference, title, template_id, start_step_order, initial_note } = body as {
    reference?: string;
    title?: string;
    template_id?: string;
    start_step_order?: number;
    initial_note?: string;
  };

  if (!reference || !title || !template_id) {
    return json({ error: 'reference, title e template_id são obrigatórios' }, 400);
  }

  if (start_step_order !== undefined && start_step_order !== 1) {
    return json({ error: 'start_step_order > 1 não é suportado nesta versão' }, 400);
  }

  const admin = createAdminClient();

  const { data: tmpl } = await admin
    .from('workflow_templates')
    .select('id')
    .eq('id', template_id)
    .eq('is_active', true)
    .single();

  if (!tmpl) {
    return json({ error: 'Fluxo não encontrado ou inativo' }, 404);
  }

  const { data: created, error } = await createWorkflowInstance(admin, {
    templateId: template_id,
    reference: String(reference).trim(),
    title: String(title).trim(),
    startedBy: null,
  });

  if (error || !created) {
    return json({ error: error ?? 'Falha ao criar instância' }, 500);
  }

  if (initial_note) {
    await admin
      .from('workflow_steps')
      .update({
        notes: [{
          author_id: 'system',
          author_name: 'API',
          step_title: 'Início',
          text: String(initial_note).trim(),
          created_at: new Date().toISOString(),
        }],
      })
      .eq('id', created.first_step_id);
  }

  return json({
    instance_id: created.instance_id,
    reference,
    current_step_id: created.first_step_id,
    due_at: created.due_at,
  });
}
