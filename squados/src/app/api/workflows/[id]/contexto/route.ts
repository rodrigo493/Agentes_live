import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const contexto: string = body.contexto?.trim() ?? '';
  if (!contexto) return NextResponse.json({ error: 'contexto obrigatório' }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin
    .from('workflows')
    .update({ contexto_adicional: contexto })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
