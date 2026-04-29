import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

const NOMUS_BASE = 'https://live.nomus.com.br/live/rest';
const NOMUS_AUTH = process.env.NOMUS_BASIC_AUTH ?? 'aW50ZWdyYWRvcmVycDptOE9SQ3JUZ3VTcHFkeDE=';

const HEADERS_NOMUS = {
  Authorization: `Basic ${NOMUS_AUTH}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ recurso: string }> }
) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { recurso } = await params;
  const search = req.nextUrl.search ?? '';
  const url = `${NOMUS_BASE}/${recurso}${search}`;

  const res = await fetch(url, {
    headers: HEADERS_NOMUS,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Nomus retornou ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recurso: string }> }
) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { recurso } = await params;
  const body = await req.json();
  const url = `${NOMUS_BASE}/${recurso}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS_NOMUS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `Nomus retornou ${res.status}`, detalhe: texto },
      { status: res.status }
    );
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}
