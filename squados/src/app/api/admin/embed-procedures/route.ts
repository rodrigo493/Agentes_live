import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getAuthenticatedUser();
    if (profile.role !== 'master_admin') {
      return NextResponse.json({ error: 'Apenas master_admin' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: docs, error } = await admin
    .from('knowledge_docs')
    .select('id, content')
    .eq('doc_type', 'procedure')
    .is('embedding', null)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!docs || docs.length === 0) return NextResponse.json({ embedded: 0 });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });

  let embedded = 0;
  for (const doc of docs) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: doc.content.slice(0, 8000) }),
      });
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vector = json.data?.[0]?.embedding;
      if (!vector) continue;

      await admin
        .from('knowledge_docs')
        .update({ embedding: JSON.stringify(vector) } as any)
        .eq('id', doc.id);

      embedded++;
    } catch {
      // continua para o próximo doc
    }
  }

  return NextResponse.json({ embedded, total: docs.length });
}
