import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

async function guardAdmin() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') return false;
  return true;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await guardAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('missoes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await guardAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { titulo, descricao } = body as { titulo?: string; descricao?: string };
  if (!titulo?.trim()) return NextResponse.json({ error: 'titulo obrigatório' }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('missoes')
    .update({ titulo: titulo.trim(), descricao: descricao?.trim() ?? '' })
    .eq('id', id)
    .select('id, titulo, descricao')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
