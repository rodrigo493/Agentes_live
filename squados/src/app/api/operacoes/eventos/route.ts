import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const apenasNaoLidos = req.nextUrl.searchParams.get('nao_lidos') === '1';

  const admin = createAdminClient();

  let q = admin
    .from('eventos_autonomos')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(limit);

  if (apenasNaoLidos) q = q.eq('lido', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ eventos: data ?? [] });
}
