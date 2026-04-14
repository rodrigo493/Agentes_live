import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    const body = await req.json() as { endpoint: string };

    const admin = createAdminClient();
    await admin.from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', body.endpoint);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
}
