import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const soul: string = body.soul_prompt ?? '';

  if (soul.trim().length < 50) {
    return NextResponse.json({ error: 'Soul prompt muito curto (mínimo 50 caracteres)' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('agentes_config')
    .update({ soul_prompt: soul.trim() })
    .eq('id', id)
    .select('id, atualizado_em')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated_at: data.atualizado_em });
}
