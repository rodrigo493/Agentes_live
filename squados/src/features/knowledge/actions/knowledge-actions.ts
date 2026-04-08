'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAuthenticatedUser, requirePermission } from '@/shared/lib/rbac/guards';
import { canAccessSector } from '@/shared/lib/rbac/permissions';
import { ingestDocumentSchema } from '@/shared/lib/validation/schemas';
import { logAudit } from '@/features/audit/lib/audit-logger';

export async function getSectorKnowledgeAction(sectorId: string) {
  const { profile } = await getAuthenticatedUser();

  if (!canAccessSector(profile.role, profile.sector_id, sectorId, 'knowledge', 'read')) {
    return { error: 'Sem permissão', data: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge_docs')
    .select('*, profiles!uploaded_by(full_name)')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data };
}

export async function ingestDocumentAction(formData: FormData) {
  const { user, profile } = await getAuthenticatedUser();

  const raw = {
    sector_id: formData.get('sector_id') as string,
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    doc_type: formData.get('doc_type') as string,
    tags: JSON.parse(formData.get('tags') as string || '[]'),
  };

  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (!canAccessSector(profile.role, profile.sector_id, parsed.data.sector_id, 'ingestion', 'write')) {
    return { error: 'Sem permissão para ingerir conteúdo neste setor' };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('knowledge_docs')
    .insert({
      sector_id: parsed.data.sector_id,
      title: parsed.data.title,
      content: parsed.data.content,
      doc_type: parsed.data.doc_type,
      uploaded_by: user.id,
      tags: parsed.data.tags,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Pipeline: documento ingerido → processed_memory (Camada 2)
  await adminClient.from('processed_memory').insert({
    sector_id: parsed.data.sector_id,
    source_type: parsed.data.doc_type === 'transcript' ? 'transcript' : 'knowledge_doc',
    source_id: data.id,
    content: parsed.data.content,
    summary: parsed.data.title,
    user_id: user.id,
    tags: parsed.data.tags ?? [],
    relevance_score: 0.7, // documentos ingeridos têm relevância alta por default
    processing_status: 'completed',
    processed_at: new Date().toISOString(),
    context: {
      doc_id: data.id,
      doc_type: parsed.data.doc_type,
      channel: 'knowledge_ingestion',
    },
  });

  // Documentos ingeridos podem ir direto para knowledge_memory (Camada 3)
  // se forem do tipo procedimento, manual ou política
  const autoPromoteTypes = ['procedure', 'manual'];
  if (autoPromoteTypes.includes(parsed.data.doc_type)) {
    await adminClient.from('knowledge_memory').insert({
      sector_id: parsed.data.sector_id,
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.doc_type === 'manual' ? 'technical' : 'procedure',
      confidence_score: 0.8,
      validated_by: user.id,
      validation_status: 'human_validated',
      tags: parsed.data.tags ?? [],
    });
  }

  await logAudit({
    userId: user.id,
    action: 'content_upload',
    resourceType: 'knowledge_doc',
    resourceId: data.id,
    details: { title: parsed.data.title, doc_type: parsed.data.doc_type, sector_id: parsed.data.sector_id },
  });

  return { success: true, data };
}
