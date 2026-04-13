import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAuthUrl } from '@/features/calendar/lib/google-calendar';

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google Calendar não configurado no servidor' }, { status: 503 });
  }

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
  const appUrl = process.env.APP_URL ?? `https://${req.headers.get('host')}`;
  if (!user) return NextResponse.redirect(new URL('/login', appUrl));

  // Use user ID as state for CSRF protection
  const state = Buffer.from(user.id).toString('base64');
  const authUrl = getGoogleAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
