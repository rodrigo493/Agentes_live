import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const intencao: string = body.intencao?.trim() ?? '';
  if (!intencao) return NextResponse.json({ error: 'intencao obrigatória' }, { status: 400 });

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system:
      'Você é um assistente estratégico da empresa Live Equipamentos, fabricante brasileiro de equipamentos de Pilates com IA embarcada. Retorne APENAS JSON válido, sem texto adicional, sem markdown.',
    messages: [
      {
        role: 'user',
        content: `O usuário descreveu a seguinte intenção de missão:\n"${intencao}"\n\nGere entre 4 e 6 perguntas abertas, claras e objetivas que, quando respondidas, darão ao agente executor todo o contexto necessário para planejar e executar esta missão com excelência.\n\nRetorne APENAS um JSON válido neste formato:\n{"perguntas": ["pergunta 1", "pergunta 2", ...]}`,
      },
    ],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{"perguntas":[]}';

  try {
    const match = text.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match?.[0] ?? text);
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: 'Falha ao processar resposta da IA' }, { status: 500 });
  }
}
