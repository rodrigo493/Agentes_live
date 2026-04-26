import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function POST(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!TELEGRAM_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN não configurado' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { mensagem, chat_id } = body as { mensagem?: string; chat_id?: string };

  if (!mensagem?.trim()) {
    return NextResponse.json({ error: 'mensagem obrigatória' }, { status: 400 });
  }

  const targetChatId = chat_id ?? DEFAULT_CHAT_ID;
  if (!targetChatId) {
    return NextResponse.json({ error: 'TELEGRAM_CHAT_ID não configurado' }, { status: 503 });
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: mensagem,
        parse_mode: 'Markdown',
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Telegram API: ${err}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
