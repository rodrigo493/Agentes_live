# Especificação de Integração — Live Universe
**Data:** 2026-04-07
**Setores:** Todos os 17 setores
**Versão:** 1.0.0
**Agente:** Ivan Integração 🔌
**Stack:** Next.js 14 (App Router) + Supabase + AI SDK (Anthropic)

---

## Visão Geral da Arquitetura

```
┌────────────────────────────────────────────────────┐
│                   Next.js 14 (App Router)           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Chat UI    │  │  Workspace   │  │  Grupos   │  │
│  │  /setor/    │  │  /workspace/ │  │  /grupos/ │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         └────────────────┴───────────────┘         │
│                    API Routes                       │
│  /api/chat  /api/memory  /api/context  /api/exec   │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│                   Supabase                          │
│  Auth (JWT)  │  PostgreSQL (RLS)  │  Storage       │
│  Realtime    │  Edge Functions    │  Vector (pgvec)│
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│                Anthropic Claude API                 │
│  claude-sonnet-4-6 (operacional)                    │
│  claude-opus-4-6   (executivo/governança)           │
└────────────────────────────────────────────────────┘
```

---

## Schema de Banco de Dados — Tabelas Supabase

### Tabela: `setores`

```sql
CREATE TABLE setores (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code        text UNIQUE NOT NULL,    -- 'solda', 'rh', 'financeiro', etc.
  name        text NOT NULL,
  description text,
  area        text,                    -- 'operacional', 'suporte', 'comercial', 'administrativo'
  agent_model text DEFAULT 'claude-sonnet-4-6',
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Seed dos 17 setores
INSERT INTO setores (code, name, area) VALUES
  ('solda',                      'Solda',                       'operacional'),
  ('inspecao_qualidade_solda',   'Inspeção Qualidade Solda',    'operacional'),
  ('lavagem',                    'Lavagem',                     'operacional'),
  ('pintura',                    'Pintura',                     'operacional'),
  ('inspecao_qualidade_pintura', 'Inspeção Qualidade Pintura',  'operacional'),
  ('montagem',                   'Montagem',                    'operacional'),
  ('expedicao',                  'Expedição',                   'operacional'),
  ('compras',                    'Compras',                     'suporte'),
  ('engenharia',                 'Engenharia',                  'suporte'),
  ('assistencia_tecnica',        'Assistência Técnica',         'suporte'),
  ('comercial',                  'Comercial',                   'comercial'),
  ('marketing',                  'Marketing',                   'comercial'),
  ('pos_venda',                  'Pós-Venda',                   'comercial'),
  ('financeiro',                 'Financeiro',                  'administrativo'),
  ('contabil',                   'Contábil',                    'administrativo'),
  ('administrativo',             'Administrativo',              'administrativo'),
  ('rh',                         'RH',                          'administrativo');
```

### Tabela: `messages`

```sql
CREATE TABLE messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id        uuid NOT NULL REFERENCES setores(id),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text NOT NULL,
  classification  text DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'business_confidential', 'confidential', 'personal_data')),
  importance      float DEFAULT 0.0 CHECK (importance >= 0 AND importance <= 1),
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_setor_id ON messages(setor_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_importance ON messages(importance DESC) WHERE importance >= 0.5;
```

### Tabela: `processed_memory`

```sql
CREATE TABLE processed_memory (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id        uuid NOT NULL REFERENCES setores(id),
  content         text NOT NULL,
  summary         text,
  classification  text DEFAULT 'internal',
  importance      float NOT NULL CHECK (importance >= 0 AND importance <= 1),
  source_message_ids uuid[],           -- IDs das mensagens originais
  ttl_days        int DEFAULT 90,
  expires_at      timestamptz GENERATED ALWAYS AS (created_at + (ttl_days || ' days')::interval) STORED,
  consolidated    boolean DEFAULT false,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_processed_memory_setor_id ON processed_memory(setor_id);
CREATE INDEX idx_processed_memory_importance ON processed_memory(importance DESC);
CREATE INDEX idx_processed_memory_expires_at ON processed_memory(expires_at) WHERE NOT consolidated;
```

### Tabela: `knowledge_memory`

```sql
CREATE TABLE knowledge_memory (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id        uuid NOT NULL REFERENCES setores(id),
  title           text NOT NULL,
  content         text NOT NULL,
  classification  text DEFAULT 'internal',
  importance      float NOT NULL DEFAULT 0.8,
  tags            text[],
  lgpd_basis      text,                -- 'contrato_trabalho', 'obrigacao_legal', 'consentimento', null
  revision_due    timestamptz,         -- próxima revisão obrigatória
  validated_by    uuid REFERENCES auth.users(id),
  validated_at    timestamptz,
  source_type     text DEFAULT 'agent' CHECK (source_type IN ('agent', 'supervisor', 'system', 'import')),
  embedding       vector(1536),        -- pgvector para busca semântica
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_knowledge_memory_setor_id ON knowledge_memory(setor_id);
CREATE INDEX idx_knowledge_memory_tags ON knowledge_memory USING gin(tags);
CREATE INDEX idx_knowledge_memory_embedding ON knowledge_memory USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_memory_revision_due ON knowledge_memory(revision_due) WHERE revision_due IS NOT NULL;
```

### Tabela: `themes`

```sql
CREATE TABLE themes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id        uuid NOT NULL REFERENCES setores(id),
  title           text NOT NULL,
  description     text,
  occurrences     int DEFAULT 1,
  first_seen      timestamptz DEFAULT now(),
  last_seen       timestamptz DEFAULT now(),
  source_ids      uuid[],              -- processed_memory IDs que geraram este tema
  is_active       boolean DEFAULT true,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
```

### Tabela: `executive_views`

```sql
CREATE TABLE executive_views (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id        uuid NOT NULL REFERENCES setores(id),
  period          text NOT NULL,       -- 'daily', 'weekly', 'monthly'
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  metrics         jsonb NOT NULL,      -- KPIs agregados e anonimizados
  alerts          jsonb DEFAULT '[]',  -- alertas de desvio
  computed_at     timestamptz DEFAULT now(),
  UNIQUE (setor_id, period, period_start)
);
```

### Tabela: `grupos`

```sql
CREATE TABLE grupos (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text NOT NULL,
  description     text,
  setor_ids       uuid[],              -- setores participantes
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE grupo_members (
  grupo_id  uuid NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id),
  role      text DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  added_by  uuid NOT NULL REFERENCES auth.users(id),
  added_at  timestamptz DEFAULT now(),
  PRIMARY KEY (grupo_id, user_id)
);
```

---

## Storage — Estrutura de Arquivos

```
supabase/storage/
├── sector-docs/                        # Documentos por setor
│   ├── {setor_id}/
│   │   ├── procedimentos/              # PDFs e docs de procedimento
│   │   ├── fichas-tecnicas/            # Fichas técnicas de insumos
│   │   └── relatorios/                 # Relatórios gerados
├── knowledge-attachments/              # Arquivos vinculados a knowledge_memory
│   └── {knowledge_id}/
├── executive-reports/                  # Relatórios executivos gerados
│   └── {year}/{month}/
└── audit-exports/                      # Exports de auditoria (somente admin)
    └── {year}/{month}/
```

**Políticas de Storage (Supabase):**
- `sector-docs`: leitura para `setor_id` correspondente; escrita para `supervisor+`
- `knowledge-attachments`: leitura vinculada à policy de knowledge_memory
- `executive-reports`: leitura para `ceo`, `presidente`, `conselheiro`
- `audit-exports`: leitura exclusiva para `admin_sistema`, `governanca`

---

## API Routes — Next.js 14 App Router

### POST `/api/chat`

Endpoint principal de chat com agente setorial.

**Request:**
```typescript
// POST /api/chat
{
  setor_id: string;       // UUID do setor
  message: string;        // Mensagem do usuário
  session_id?: string;    // ID da sessão (para manter contexto)
}
```

**Response:**
```typescript
{
  message_id: string;
  content: string;        // Resposta do agente (streaming via SSE)
  importance: number;     // Score calculado pelo modelo
  metadata: {
    tokens_used: number;
    model: string;
    context_items_used: number;
  }
}
```

**Implementação:**
```typescript
// app/api/chat/route.ts
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { setor_id, message, session_id } = await request.json();

  // Verificar se usuário pertence ao setor
  const { data: userSetor } = await supabase
    .from('user_profiles')
    .select('setor_id, role')
    .eq('user_id', user.id)
    .single();

  if (userSetor?.setor_id !== setor_id && !['supervisor', 'gerente', 'diretoria', 'ceo', 'presidente'].includes(userSetor?.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Buscar contexto de memória do setor
  const context = await buildAgentContext(supabase, setor_id);

  // Buscar system prompt do agente do setor
  const { data: setor } = await supabase
    .from('setores')
    .select('system_prompt, agent_model')
    .eq('id', setor_id)
    .single();

  const anthropic = new Anthropic();
  const stream = await anthropic.messages.stream({
    model: setor.agent_model || 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: setor.system_prompt,
    messages: [
      ...context.recentMessages,
      { role: 'user', content: message }
    ]
  });

  // Salvar mensagem do usuário
  await supabase.from('messages').insert({
    setor_id, user_id: user.id, role: 'user', content: message
  });

  // Retornar stream SSE
  return new Response(stream.toReadableStream(), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

---

### GET `/api/memory/[setor_id]`

Busca contexto de memória de um setor para uso pelo agente.

**Response:**
```typescript
{
  knowledge: KnowledgeItem[];     // knowledge_memory relevantes
  processed: ProcessedItem[];     // processed_memory recentes
  themes: Theme[];                // temas ativos do setor
}
```

---

### POST `/api/memory/promote`

Promove um insight de processed para knowledge_memory (requer role supervisor+).

**Request:**
```typescript
{
  processed_id: string;
  title: string;
  tags?: string[];
  revision_due?: string;  // ISO date
}
```

---

### POST `/api/memory/consolidate`

Trigger de consolidação de memória (chamado pelo cron job ou service_role).

**Request:**
```typescript
{
  setor_id: string;
  dry_run?: boolean;      // Simular sem persistir
}
```

---

### GET `/api/executive/[setor_id]`

Busca visão executiva agregada de um setor. Requer role `ceo`, `presidente`, `conselheiro`.

**Response:**
```typescript
{
  setor: string;
  period: 'daily' | 'weekly' | 'monthly';
  metrics: Record<string, number | string>;
  alerts: Alert[];
  last_updated: string;
}
```

---

### GET `/api/executive/dashboard`

Dashboard executivo completo — todos os setores. Requer role `ceo` ou `presidente`.

**Response:**
```typescript
{
  setores: ExecutiveSectorView[];
  global_alerts: Alert[];
  health_score: number;           // 0-100 score de saúde operacional
  computed_at: string;
}
```

---

### POST `/api/search/knowledge`

Busca semântica na knowledge_memory do setor via pgvector.

**Request:**
```typescript
{
  setor_id: string;
  query: string;
  limit?: number;        // default: 5
  threshold?: number;    // cosine similarity mínimo, default: 0.7
}
```

**Implementação:**
```typescript
// app/api/search/knowledge/route.ts
export async function POST(request: Request) {
  const { setor_id, query, limit = 5, threshold = 0.7 } = await request.json();

  // Gerar embedding da query
  const anthropic = new Anthropic();
  // Usar API de embeddings para gerar vetor da query
  const queryEmbedding = await generateEmbedding(query);

  // Busca semântica via pgvector
  const { data } = await supabase.rpc('search_knowledge', {
    p_setor_id: setor_id,
    p_embedding: queryEmbedding,
    p_match_threshold: threshold,
    p_match_count: limit
  });

  return Response.json({ results: data });
}
```

**Stored procedure para busca vetorial:**
```sql
CREATE OR REPLACE FUNCTION search_knowledge(
  p_setor_id uuid,
  p_embedding vector(1536),
  p_match_threshold float DEFAULT 0.7,
  p_match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, title text, content text, similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    km.id,
    km.title,
    km.content,
    1 - (km.embedding <=> p_embedding) AS similarity
  FROM knowledge_memory km
  WHERE
    km.setor_id = p_setor_id
    AND 1 - (km.embedding <=> p_embedding) > p_match_threshold
  ORDER BY km.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;
```

---

## Fluxo de Contexto do Agente (Pseudocódigo)

```typescript
async function buildAgentContext(supabase, setor_id: string) {
  // 1. Buscar últimas mensagens da sessão (raw context)
  const recentMessages = await supabase
    .from('messages')
    .select('role, content')
    .eq('setor_id', setor_id)
    .order('created_at', { ascending: false })
    .limit(20);                            // últimas 20 mensagens

  // 2. Buscar knowledge_memory relevante (busca semântica)
  const relevantKnowledge = await searchKnowledge(setor_id, lastUserMessage);

  // 3. Buscar temas ativos do setor
  const activeThemes = await supabase
    .from('themes')
    .select('title, description')
    .eq('setor_id', setor_id)
    .eq('is_active', true)
    .order('occurrences', { ascending: false })
    .limit(5);

  // 4. Construir context block para o system prompt
  const contextBlock = `
## Contexto de Memória do Setor

### Conhecimento Validado
${relevantKnowledge.map(k => `- ${k.title}: ${k.content}`).join('\n')}

### Padrões Recorrentes do Setor
${activeThemes.map(t => `- ${t.title}: ${t.description}`).join('\n')}
  `;

  return {
    recentMessages: recentMessages.data.reverse(),
    contextBlock,
    tokensEstimate: estimateTokens(contextBlock)
  };
}
```

---

## Graceful Degradation

Em todos os endpoints, se o serviço de IA estiver indisponível:

```typescript
// lib/agent/fallback.ts
export async function withAgentFallback<T>(
  operation: () => Promise<T>,
  fallbackMessage: string
): Promise<T | { fallback: true; message: string }> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      await logAgentFailure(error);
      return {
        fallback: true,
        message: fallbackMessage || 'Agente temporariamente indisponível. Por favor, consulte seu supervisor ou tente novamente em instantes.'
      };
    }
    throw error; // re-throw erros não relacionados à IA
  }
}
```

**Mensagens de fallback por setor (exemplos):**
- Setores operacionais: "Agente indisponível. Consulte o supervisor de turno."
- RH/Financeiro: "Serviço indisponível. Entre em contato diretamente com o setor."
- Assistência Técnica: "Agente offline. Abra um chamado pelo sistema de tickets."

---

## Camada Executiva — Agentes CEO/Presidente

Os agentes executivos não usam o endpoint `/api/chat` padrão — eles têm um endpoint dedicado que agrega visões de todos os setores.

### POST `/api/executive/chat`

**Request:**
```typescript
{
  message: string;
  executive_role: 'ceo' | 'presidente' | 'conselheiro';
  focus_setores?: string[];    // filtrar apenas alguns setores
}
```

**Contexto do agente executivo:**
```typescript
async function buildExecutiveContext(role: string, focus?: string[]) {
  // Busca executive_views de todos os setores (ou subset)
  const views = await supabase
    .from('executive_views')
    .select('setor_id, metrics, alerts, setores(name, area)')
    .eq('period', 'weekly')
    .in('setor_id', focus || allSectorIds)
    .order('computed_at', { ascending: false });

  // Consolidar alertas críticos
  const criticalAlerts = views.data
    .flatMap(v => v.alerts)
    .filter(a => a.severity === 'critical');

  // NUNCA incluir: raw messages, dados pessoais, valores absolutos financeiros
  return {
    summary: buildExecutiveSummary(views.data),
    criticalAlerts,
    sectorsReporting: views.data.length
  };
}
```

**Modelo para agentes executivos:** `claude-opus-4-6` (maior capacidade de raciocínio estratégico)

---

## Cron Jobs / Scheduled Tasks

Implementados via Supabase Edge Functions agendadas:

| Job | Frequência | Função |
|-----|-----------|--------|
| `memory-consolidation` | Domingo 02:00 | Consolida processed_memory com similarity > 0.85 |
| `memory-expiry-cleanup` | Diário 03:00 | Remove processed_memory com expires_at no passado |
| `executive-views-compute` | Diário 06:00 | Recalcula executive_views para todos os setores |
| `knowledge-revision-alerts` | Semanal segunda 08:00 | Alerta supervisores sobre knowledge_memory com revisão vencida |
| `rh-ttl-enforcement` | Diário 01:00 | Força remoção de raw_messages de RH com > 14 dias |

---

## Variáveis de Ambiente (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://{project}.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Nunca expor ao cliente

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Sistema
NEXT_PUBLIC_APP_URL=https://sistema.liveuni.com.br
MEMORY_CONSOLIDATION_THRESHOLD=0.85
DEFAULT_AGENT_MODEL=claude-sonnet-4-6
EXECUTIVE_AGENT_MODEL=claude-opus-4-6
```

---

## Checklist de Implementação

- [ ] Criar todas as tabelas com RLS ativado (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
- [ ] Aplicar todas as policies RLS documentadas em `politica-contexto.md`
- [ ] Instalar extensão `pgvector` no projeto Supabase
- [ ] Configurar Storage buckets com políticas de acesso
- [ ] Implementar endpoints `/api/chat`, `/api/memory/*`, `/api/executive/*`
- [ ] Implementar `buildAgentContext()` com busca semântica
- [ ] Configurar streaming SSE no chat
- [ ] Implementar fallback para indisponibilidade do modelo
- [ ] Configurar Supabase Edge Functions para cron jobs
- [ ] Adicionar `system_prompt` na tabela `setores` com os prompts do blueprint
- [ ] Testar isolamento: operador A não acessa dados do setor B
- [ ] Testar visibilidade executiva: CEO vê aggregate, não raw

---

*Gerado pelo agente Ivan Integração 🔌 — Agentes Fábrica — Live Universe*
*Run ID: 2026-04-07-115128 | Versão: v1*
