import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { exchangeCodeForTokens } from '@/features/calendar/lib/google-calendar';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const redirectTo = new URL('/producao', req.url);

  if (error || !code || !state) {
    redirectTo.searchParams.set('error', error ?? 'google_auth_failed');
    return NextResponse.redirect(redirectTo);
  }

  // Verify session
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // Validate state (must match user ID)
  const expectedState = Buffer.from(user.id).toString('base64');
  if (state !== expectedState) {
    redirectTo.searchParams.set('error', 'invalid_state');
    return NextResponse.redirect(redirectTo);
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) {
    redirectTo.searchParams.set('error', 'token_exchange_failed');
    return NextResponse.redirect(redirectTo);
  }

  // Persist tokens
  const admin = createAdminClient();
  await admin.from('google_calendar_tokens').upsert({
    user_id:       user.id,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry:  new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    google_email:  tokens.email ?? null,
    calendar_id:   'primary',
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'user_id' });

  redirectTo.searchParams.set('google_connected', '1');
  return NextResponse.redirect(redirectTo);
}
