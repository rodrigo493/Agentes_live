import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const MODEL_ID = 'eleven_multilingual_v2';

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

  let text = '';
  let voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const body = await req.json();
    text = (body.text as string ?? '').trim();
    if (body.voice_id) voiceId = body.voice_id as string;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!text) return NextResponse.json({ error: 'text obrigatório' }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Texto acima do limite (5000 chars)' }, { status: 400 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    }
  );

  if (!upstream.ok || !upstream.body) {
    const msg = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `ElevenLabs ${upstream.status}: ${msg.slice(0, 200)}` },
      { status: 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
