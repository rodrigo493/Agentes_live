import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { generateEmbedding } from '@/features/agents/lib/semantic-search';

export async function POST(request: NextRequest) {
  // Validate bearer token
  const authHeader = request.headers.get('authorization');
  const secret = process.env.INGEST_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sector_slug: string; title: string; content: string; source_file?: string; doc_type?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sector_slug, title, content, source_file, doc_type = 'transcript', category } = body;
  const validDocTypes = ['transcript', 'document', 'procedure', 'manual', 'note', 'other'];
  const finalDocType = validDocTypes.includes(doc_type) ? doc_type : 'transcript';

  if (!sector_slug || !title || !content) {
    return NextResponse.json(
      { error: 'sector_slug, title e content são obrigatórios' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Get sector by slug
  const { data: sector, error: sectorError } = await adminClient
    .from('sectors')
    .select('id, name')
    .eq('slug', sector_slug)
    .eq('is_active', true)
    .single();

  if (sectorError || !sector) {
    return NextResponse.json(
      { error: `Setor não encontrado: ${sector_slug}` },
      { status: 404 }
    );
  }

  // Get system user (first master_admin)
  const { data: systemUser, error: userError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'master_admin')
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (userError || !systemUser) {
    return NextResponse.json(
      { error: 'Usuário sistema não encontrado' },
      { status: 500 }
    );
  }

  // Insert into knowledge_docs
  const { data: doc, error: docError } = await adminClient
    .from('knowledge_docs')
    .insert({
      sector_id: sector.id,
      title,
      content,
      doc_type: finalDocType,
      category: category ?? null,
      uploaded_by: systemUser.id,
      tags: finalDocType === 'transcript' ? ['reuniao', 'automatico', sector_slug] : ['conhecimento', 'automatico', sector_slug],
      metadata: {
        source: finalDocType === 'transcript' ? 'plaud_autoflow' : 'presidente_brain',
        source_file: source_file ?? null,
        ingested_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  // Gerar embedding em background (não bloqueia a resposta)
  generateEmbedding(`${title}\n\n${content.slice(0, 6000)}`)
    .then(async (embedding) => {
      await adminClient
        .from('knowledge_docs')
        .update({ embedding })
        .eq('id', doc.id);
    })
    .catch((err) => console.error('[ingest-meeting] embedding error:', err));

  // Insert into processed_memory so the agent picks it up
  await adminClient.from('processed_memory').insert({
    sector_id: sector.id,
    source_type: finalDocType === 'transcript' ? 'transcript' : 'knowledge_doc',
    source_id: doc.id,
    content,
    summary: title,
    user_id: systemUser.id,
    tags: finalDocType === 'transcript' ? ['reuniao', 'automatico', sector_slug] : ['conhecimento', 'automatico', sector_slug],
    relevance_score: 0.8,
    processing_status: 'completed',
    processed_at: new Date().toISOString(),
    context: {
      doc_id: doc.id,
      doc_type: finalDocType,
      channel: 'plaud_autoflow',
      sector_name: sector.name,
      source_file: source_file ?? null,
    },
  });

  return NextResponse.json({
    success: true,
    doc_id: doc.id,
    sector: sector.name,
    message: `Reunião ingerida no setor ${sector.name}`,
  });
}
