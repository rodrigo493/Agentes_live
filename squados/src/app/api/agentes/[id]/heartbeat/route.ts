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
  const admin = createAdminClient();

  // Atualizar config local do agente
  const update: Record<string, unknown> = {};
  if (typeof body.heartbeat_ativo === 'boolean') update.heartbeat_ativo = body.heartbeat_ativo;
  if (body.modelo) update.modelo = body.modelo;

  if (Object.keys(update).length > 0) {
    const { error } = await admin
      .from('agentes_config')
      .update(update)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atualizar schedule do job no pg_cron, se solicitado
  if (body.job_name && body.schedule) {
    const { error: cronError } = await admin.rpc('atualizar_cron_schedule', {
      p_job_name: body.job_name,
      p_schedule: body.schedule,
    });
    if (cronError) return NextResponse.json({ error: cronError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
