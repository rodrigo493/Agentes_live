import OpenAI from 'openai';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface SemanticSearchResult {
  id: string;
  title: string;
  content: string;
  doc_type: string;
  category: string | null;
  tags: string[];
  similarity: number;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function semanticSearch(params: {
  query: string;
  sectorId: string;
  limit?: number;
  threshold?: number;
}): Promise<SemanticSearchResult[]> {
  const { query, sectorId, limit = 5, threshold = 0.5 } = params;

  try {
    const embedding = await generateEmbedding(query);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('match_knowledge_docs', {
      query_embedding: embedding,
      match_sector_id: sectorId,
      match_count: limit,
      match_threshold: threshold,
    });

    if (error) {
      console.error('[semanticSearch] RPC error:', error.message);
      return [];
    }

    return (data ?? []) as SemanticSearchResult[];
  } catch (err) {
    console.error('[semanticSearch] error:', err);
    return [];
  }
}
