# Claude Memory MCP Server Design

**Data:** 2026-04-17

## Goal

Criar um MCP server Node.js standalone que armazena memória persistente do Claude no Supabase Postgres com busca semântica via pgvector + OpenAI embeddings. Disponível globalmente em todos os projetos, substituindo e ampliando o sistema de arquivos atual em `.claude-memory/`.

## Architecture

### Infraestrutura

- **Supabase dedicado:** `https://haeogvqaiqzakqossnjc.supabase.co` — projeto isolado, sem dados de aplicação
- **MCP Server:** processo Node.js/TypeScript em `C:/Users/rodri/claude-memory-mcp/`
- **Registro global:** `C:/Users/rodri/.claude/settings.json` → disponível em todos os projetos automaticamente
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dimensões, ~$0.02/1M tokens)

### Data Model

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('user', 'feedback', 'project', 'reference', 'conversation')),
  title       text NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  project     text NOT NULL DEFAULT 'global',
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON memories (type);
CREATE INDEX ON memories (project);
```

## MCP Tools

### `memory_save`
```typescript
{
  type: 'user' | 'feedback' | 'project' | 'reference' | 'conversation',
  title: string,        // título curto e descritivo
  content: string,      // conteúdo completo
  project?: string,     // ex: 'squados', 'livecrm', 'global' (default: 'global')
  session_id?: string,  // ID da conversa de origem
}
// Retorna: { id: string }
// Gera embedding automaticamente via OpenAI antes de inserir
```

### `memory_search`
```typescript
{
  query: string,     // busca semântica em linguagem natural
  limit?: number,    // default: 5
  project?: string,  // filtrar por projeto (omitir = todos)
  type?: string,     // filtrar por tipo
}
// Retorna: Memory[] ordenado por similaridade cosseno
```

### `memory_list`
```typescript
{
  type?: string,     // filtrar por tipo
  project?: string,  // filtrar por projeto
  limit?: number,    // default: 20
}
// Retorna: Memory[] ordenado por updated_at DESC (sem embedding no payload)
```

### `memory_delete`
```typescript
{
  id: string,  // UUID da memória
}
// Retorna: { success: boolean }
```

### `memory_update`
```typescript
{
  id: string,
  content: string,  // novo conteúdo (re-gera embedding automaticamente)
  title?: string,
}
// Retorna: { success: boolean }
```

## Workflow Automático

### Início de sessão
- Ao receber as primeiras mensagens, Claude chama `memory_search` com o contexto inicial
- Resultado injetado mentalmente como contexto ("sei que SquadOS é X, VPS é Y")

### Durante a conversa
- Ao identificar decisões importantes, preferências ou contexto novo → `memory_save` automático
- Segue as mesmas regras do sistema de arquivos atual (tipos: user, feedback, project, reference)

### Ao finalizar trabalho significativo
- Salva resumo como `type: 'conversation'` com o que foi discutido e construído
- `session_id` permite agrupar memórias da mesma sessão

### Busca explícita
- Usuário pode pedir "lembra do X?" → Claude chama `memory_search` na hora

## Migração do Sistema Atual

Os 11 arquivos de `.claude-memory/` são importados como memórias iniciais na primeira execução:
- Cada arquivo `.md` → 1 entrada na tabela com type e project inferidos do nome
- Embeddings gerados no momento da importação
- Sistema de arquivos mantido como backup (não removido)

## MCP Server Structure

```
C:/Users/rodri/claude-memory-mcp/
├── package.json
├── tsconfig.json
├── .env                    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
├── src/
│   ├── index.ts            # MCP server entry point
│   ├── tools/
│   │   ├── memory-save.ts
│   │   ├── memory-search.ts
│   │   ├── memory-list.ts
│   │   ├── memory-delete.ts
│   │   └── memory-update.ts
│   ├── lib/
│   │   ├── supabase.ts     # createClient com service role
│   │   └── embeddings.ts   # OpenAI embedding generation
│   └── migrate.ts          # script de migração dos arquivos existentes
└── supabase/
    └── migrations/
        └── 001_memories.sql
```

## Configuração Global

Em `C:/Users/rodri/.claude/settings.json`, adicionar na seção `mcpServers`:

```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "node",
      "args": ["C:/Users/rodri/claude-memory-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://haeogvqaiqzakqossnjc.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service_role_key>",
        "OPENAI_API_KEY": "<openai_key>"
      }
    }
  }
}
```

## Constraints

- Embeddings gerados apenas no `memory_save` e `memory_update` (não no search — o query vira embedding para comparação)
- Máximo 10.000 memórias (ivfflat com lists=100 requer mínimo 100 * 39 = 3.900 linhas para ser eficiente)
- `session_id` é opcional — memórias manuais (tipo user/feedback) não precisam de session
- Service role key fica apenas no `.env` local e no `settings.json` — nunca no git
