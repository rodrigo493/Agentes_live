import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const API_KEY = process.env.WORKFLOW_API_KEY;

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!API_KEY || key !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { reference, title, template_id, start_step_order, initial_note } = body as {
    reference?: string;
    title?: string;
    template_id?: string;
    start_step_order?: number;
    initial_note?: string;
  };

  if (!reference || !title || !template_id) {
    return NextResponse.json(
      { error: 'reference, title e template_id são obrigatórios' },
      { status: 400 }
    );
  }

  if (start_step_order !== undefined && start_step_order !== 1) {
    return NextResponse.json(
      { error: 'start_step_order > 1 não é suportado nesta versão' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: tmpl } = await admin
    .from('workflow_templates')
    .select('id')
    .eq('id', template_id)
    .eq('is_active', true)
    .single();

  if (!tmpl) {
    return NextResponse.json({ error: 'Fluxo não encontrado ou inativo' }, { status: 404 });
  }

  const { data: instanceId, error } = await admin.rpc('start_workflow_instance', {
    p_template_id: template_id,
    p_reference: String(reference).trim(),
    p_title: String(title).trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let currentStepId: string | null = null;
  let dueAt: string | null = null;

  if (instanceId) {
    const { data: firstStep } = await admin
      .from('workflow_steps')
      .select('id, due_at')
      .eq('instance_id', instanceId as string)
      .order('step_order')
      .limit(1)
      .single();

    currentStepId = firstStep?.id ?? null;
    dueAt = firstStep?.due_at ?? null;

    if (firstStep && initial_note) {
      await admin
        .from('workflow_steps')
        .update({
          notes: [{
            author_id: 'system',
            author_name: 'LivePosVenda',
            step_title: 'Início',
            text: String(initial_note).trim(),
            created_at: new Date().toISOString(),
          }],
        })
        .eq('id', firstStep.id);
    }

    return NextResponse.json({
      instance_id: instanceId,
      reference,
      current_step_id: currentStepId,
      due_at: dueAt,
    });
  }

  return NextResponse.json({ error: 'Falha ao criar instância' }, { status: 500 });
}
