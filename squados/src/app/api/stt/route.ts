import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY não configurada' }, { status: 500 });
  }

  const incoming = await req.formData();
  const file = incoming.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 });

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Áudio acima de 25MB' }, { status: 400 });
  }

  const form = new FormData();
  form.append('file', file, (file as File).name || 'audio.webm');
  form.append('model_id', 'scribe_v1');

  const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `ElevenLabs ${upstream.status}: ${msg.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const text = (data.text ?? data.transcription ?? '').toString().trim();
  return NextResponse.json({ text });
}
