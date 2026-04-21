# RAG Semântico — Pesquisas no Chat SquadOS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o chat da presidência buscar documentos por similaridade semântica (vetores) em vez de apenas palavras-chave, usando as pesquisas diárias como contexto automático.

**Architecture:** Ao ingerir documentos via `ingest-meeting`, gerar embedding com OpenAI `text-embedding-3-small` e armazenar em `knowledge_docs.embedding`. Uma nova função `semanticSearch()` faz busca por cosine similarity no Supabase via RPC. O `agent-ai.ts` chama essa função e injeta os resultados no contexto antes de chamar o GPT-4o.

**Tech Stack:** Next.js 15, TypeScript, Supabase pgvector, OpenAI text-embedding-3-small (1536 dims), PostgreSQL IVFFlat index.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/00044_activate_vector_index.sql` | Criar | Ativa IVFFlat index + função RPC `match_knowledge_docs` |
| `src/features/agents/lib/semantic-search.ts` | Criar | Função `semanticSearch()` — gera embedding da query e chama RPC |
| `src/app/api/ingest-meeting/route.ts` | Modificar | Gerar embedding do documento após inserção |
| `src/features/agents/lib/agent-ai.ts` | Modificar | Injetar resultados semânticos no contexto do chat |

---

## Task 1: Migration — IVFFlat index + RPC match_knowledge_docs

**Files:**
- Create: `supabase/migrations/00044_activate_vector_index.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- supabase/migrations/00044_activate_vector_index.sql

-- Garante extensão ativa
CREATE EXTENSION IF NOT EXISTS vector;

-- IVFFlat index para cosine similarity em knowledge_docs
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding
  ON knowledge_docs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Função RPC para busca semântica
CREATE OR REPLACE FUNCTION match_knowledge_docs(
  query_embedding vector(1536),
  match_sector_id uuid,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  doc_type text,
  category text,
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kd.id,
    kd.title,
    kd.content,
    kd.doc_type,
    kd.category,
    kd.tags,
    1 - (kd.embedding <=> query_embedding) AS similarity
  FROM knowledge_docs kd
  WHERE
    kd.is_active = true
    AND kd.sector_id = match_sector_id
    AND kd.embedding IS NOT NULL
    AND 1 - (kd.embedding <=> query_embedding) >= match_threshold
  ORDER BY kd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Aplicar migration no Supabase**

```bash
cd C:\VS_CODE\Agentes_live\squados
npx supabase db push
```

Saída esperada: `Applying migration 00044_activate_vector_index.sql... done`

- [ ] **Step 3: Verificar função criada**

No Supabase Dashboard → SQL Editor:
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'match_knowledge_docs';
```
Esperado: 1 row retornada.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00044_activate_vector_index.sql
git commit -m "feat: ativar IVFFlat index e RPC match_knowledge_docs para RAG"
```

---

## Task 2: semantic-search.ts — função de busca semântica

**Files:**
- Create: `src/features/agents/lib/semantic-search.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/features/agents/lib/semantic-search.ts
import OpenAI from 'openai';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // limite seguro
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
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd C:\VS_CODE\Agentes_live\squados
npx tsc --noEmit 2>&1 | grep semantic-search
```

Saída esperada: nenhum erro relacionado ao arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/features/agents/lib/semantic-search.ts
git commit -m "feat: adicionar semanticSearch com OpenAI embeddings e pgvector"
```

---

## Task 3: ingest-meeting — gerar embedding ao ingerir documento

**Files:**
- Modify: `src/app/api/ingest-meeting/route.ts`

- [ ] **Step 1: Adicionar import e chamada de embedding após inserção do doc**

Modificar `src/app/api/ingest-meeting/route.ts`. Adicionar import no topo:

```typescript
import { generateEmbedding } from '@/features/agents/lib/semantic-search';
```

Depois do bloco `if (docError)` (linha ~86), adicionar geração de embedding em background (não bloqueia resposta):

```typescript
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
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit 2>&1 | grep ingest-meeting
```

Saída esperada: sem erros.

- [ ] **Step 3: Testar ingestão com embedding**

```bash
curl -X POST https://squad.liveuni.com.br/api/ingest-meeting \
  -H "Authorization: Bearer live_ingest_2026_reunioes" \
  -H "Content-Type: application/json" \
  -d '{"sector_slug":"presidencia","title":"Teste RAG","content":"Teste de embedding para pesquisa semântica no SquadOS","doc_type":"document","category":"teste"}'
```

Aguardar 5 segundos e verificar no Supabase:
```sql
SELECT id, title, embedding IS NOT NULL as tem_embedding
FROM knowledge_docs
WHERE title = 'Teste RAG';
```
Esperado: `tem_embedding = true`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ingest-meeting/route.ts
git commit -m "feat: gerar embedding automaticamente ao ingerir documento"
```

---

## Task 4: agent-ai.ts — injetar resultados semânticos no contexto

**Files:**
- Modify: `src/features/agents/lib/agent-ai.ts`

- [ ] **Step 1: Adicionar import no topo do arquivo**

Adicionar após os imports existentes (linha ~3):

```typescript
import { semanticSearch } from './semantic-search';
```

- [ ] **Step 2: Adicionar busca semântica após getAgentContext (linha ~63)**

Logo após o bloco `try { const context = await getAgentContext(...) }` (que termina na linha ~89), adicionar:

```typescript
  // Busca semântica nas pesquisas (RAG)
  let semanticContext = '';
  try {
    const semanticResults = await semanticSearch({
      query: params.userMessage,
      sectorId: params.sectorId,
      limit: 5,
      threshold: 0.45,
    });

    if (semanticResults.length > 0) {
      semanticContext += '\n\n## Pesquisas Relevantes (busca semântica)\n';
      semanticContext += `Encontrei ${semanticResults.length} pesquisa(s) relacionada(s) à sua pergunta:\n`;
      semanticResults.forEach((r, i) => {
        semanticContext += `\n### ${i + 1}. ${r.title}`;
        if (r.category) semanticContext += ` [${r.category}]`;
        semanticContext += ` (similaridade: ${Math.round(r.similarity * 100)}%)\n`;
        semanticContext += r.content.substring(0, 2500) + '\n';
      });
    }
  } catch {
    // Falha silenciosa — chat continua sem RAG semântico
  }
```

- [ ] **Step 3: Incluir semanticContext no prompt do sistema**

Localizar onde `knowledgeContext` é adicionado ao system prompt (procurar por `systemPrompt +=` ou o local onde o prompt final é montado). Adicionar `semanticContext` logo após `knowledgeContext`:

```typescript
const fullSystemPrompt = systemPrompt + knowledgeContext + semanticContext + /* resto */;
```

O padrão exato depende de como o prompt é montado na linha ~200+. Buscar por `systemPrompt` ou `fullSystem` no arquivo e adicionar `+ semanticContext` na concatenação.

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep agent-ai
```

Saída esperada: sem erros.

- [ ] **Step 5: Testar no chat**

1. Abrir squad.liveuni.com.br → Chat Presidência
2. Perguntar: "O que as pesquisas dizem sobre o mercado de fitness no Brasil?"
3. Verificar se a resposta cita dados das pesquisas ingestionadas

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/lib/agent-ai.ts
git commit -m "feat: integrar busca semântica (RAG) no contexto do chat"
```

---

## Task 5: Gerar embeddings para documentos existentes

Os documentos já ingestionados não têm embedding. Precisamos gerá-los.

**Files:**
- Modify: `src/app/api/admin/embed-procedures/route.ts` (ou criar endpoint específico)

- [ ] **Step 1: Criar endpoint para embeddar knowledge_docs existentes**

Criar `src/app/api/admin/embed-knowledge-docs/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { generateEmbedding } from '@/features/agents/lib/semantic-search';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Buscar docs sem embedding
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
      // Aguardar 200ms para não bater rate limit
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success, failed, total: docs.length });
}
```

- [ ] **Step 2: Fazer deploy na VPS**

```bash
# Push para GitHub
git add src/app/api/admin/embed-knowledge-docs/route.ts
git commit -m "feat: endpoint para gerar embeddings de docs existentes"
git push origin main

# Na VPS — rebuild e update do serviço
ssh root@squad.liveuni.com.br "cd /tmp && git clone https://github.com/SEU_REPO squados-build && cd squados-build && docker build -t s3:latest . && docker service update --image s3:latest squad_squad"
```

- [ ] **Step 3: Executar embedding dos docs existentes**

```bash
curl -X POST https://squad.liveuni.com.br/api/admin/embed-knowledge-docs \
  -H "Authorization: Bearer live_ingest_2026_reunioes"
```

Saída esperada:
```json
{"success": 15, "failed": 0, "total": 15}
```

Rodar quantas vezes necessário até zerar os docs sem embedding (limite 50 por chamada).

- [ ] **Step 4: Verificar no Supabase**

```sql
SELECT COUNT(*) as sem_embedding FROM knowledge_docs 
WHERE embedding IS NULL AND is_active = true;
```

Esperado: `0`

---

## Resultado Final

Após implementação, o chat da presidência:
1. Recebe a pergunta do usuário
2. Gera embedding da pergunta em tempo real
3. Busca os 5 documentos mais similares semanticamente no Supabase
4. Injeta os resultados no contexto do GPT-4o
5. Responde com base nas pesquisas estratégicas acumuladas

As pesquisas diárias chegam automaticamente com embedding, ficando disponíveis para o chat no mesmo dia.
