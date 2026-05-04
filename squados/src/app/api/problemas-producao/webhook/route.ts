// src/app/api/problemas-producao/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const SECRET = process.env.PROBLEMAS_WEBHOOK_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  if (!SECRET || secret !== SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { description, client_name, received_at } = body as {
    description?: string;
    client_name?: string;
    received_at?: string;
  };

  if (!description?.trim()) return json({ error: 'description é obrigatório' }, 400);
  if (!client_name?.trim()) return json({ error: 'client_name é obrigatório' }, 400);
  if (!received_at) return json({ error: 'received_at é obrigatório' }, 400);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('production_problems')
    .insert({
      description: description.trim(),
      client_name: client_name.trim(),
      received_at,
      crm_payload: body,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[problemas webhook] insert error:', error?.message);
    return json({ error: 'Erro interno ao salvar problema' }, 500);
  }

  console.info('[problemas webhook] criado', { id: data.id, client_name });
  return json({ id: data.id }, 201);
}
