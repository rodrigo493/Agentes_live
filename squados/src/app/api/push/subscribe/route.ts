import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    const body = await req.json() as { endpoint: string; keys: { p256dh: string; auth: string } };

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id:  user.id,
        endpoint: body.endpoint,
        p256dh:   body.keys.p256dh,
        auth:     body.keys.auth,
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
}
