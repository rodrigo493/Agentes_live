import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export const runtime = 'nodejs';

async function transcribeElevenLabs(file: File, apiKey: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model_id', 'scribe_v1');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = (data.text ?? data.transcription ?? '').toString().trim();
  return text.length >= 3 ? text : null;
}

async function transcribeWhisper(file: File, apiKey: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = (data.text ?? '').toString().trim();
  return text.length >= 3 ? text : null;
}

export async function POST(req: NextRequest) {
  try {
    await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY não configurada' }, { status: 500 });
  }

  const incoming = await req.formData();
  const file = incoming.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Áudio acima de 25MB' }, { status: 400 });
  }

  // Tentar ElevenLabs primeiro
  let text = await transcribeElevenLabs(file, elevenKey);

  // Fallback: Whisper
  if (!text) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      text = await transcribeWhisper(file, openaiKey);
    }
  }

  if (!text) {
    return NextResponse.json({ error: 'Não foi possível transcrever o áudio' }, { status: 422 });
  }

  return NextResponse.json({ text });
}
