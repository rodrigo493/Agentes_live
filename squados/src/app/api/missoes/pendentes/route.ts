import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const API_KEY = process.env.WORKFLOW_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!API_KEY || key !== API_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('missoes')
    .select(`
      id,
      titulo,
      descricao,
      status,
      criado_em,
      agentes_config!id_do_responsavel (
        id,
        nome,
        papel
      )
    `)
    .eq('status', 'Planejamento')
    .order('criado_em', { ascending: true });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ missoes: data ?? [] });
}
