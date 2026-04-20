import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { generateEmbedding } from '@/features/agents/lib/semantic-search';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: docs } = await admin
    .from('knowledge_docs')
    .select('id, title, content')
    .is('embedding', null)
    .eq('is_active', true)
    .limit(50);

  if (!docs || docs.length === 0) {
    return NextResponse.json({ message: 'Nenhum documento sem embedding', count: 0 });
  }

  let success = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const embedding = await generateEmbedding(`${doc.title}\n\n${doc.content.slice(0, 6000)}`);
      await admin.from('knowledge_docs').update({ embedding }).eq('id', doc.id);
      success++;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success, failed, total: docs.length });
}
