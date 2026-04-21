# Claude Memory MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um MCP server Node.js/TypeScript que armazena memória persistente do Claude no Supabase Postgres com busca semântica via pgvector + OpenAI embeddings, disponível globalmente em todos os projetos.

**Architecture:** Processo Node.js standalone em `C:/Users/rodri/claude-memory-mcp/` executado via `npx tsx`, registrado em `~/.claude/settings.json`. Tabela `memories` no Supabase dedicado com campo `vector(1536)` para embeddings OpenAI `text-embedding-3-small`. Claude expõe 5 ferramentas MCP: memory_save, memory_search, memory_list, memory_delete, memory_update.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `@supabase/supabase-js`, `openai`, `tsx` (execução sem build).

---

## File Structure

```
C:/Users/rodri/claude-memory-mcp/
├── package.json
├── tsconfig.json
├── .env                        # credenciais (nunca no git)
├── .gitignore
├── src/
│   ├── index.ts                # MCP server entry point + registro de tools
│   ├── types.ts                # interface Memory
│   ├── lib/
│   │   ├── supabase.ts         # createClient com service role
│   │   └── embeddings.ts       # generateEmbedding via OpenAI
│   ├── tools/
│   │   ├── memory-save.ts
│   │   ├── memory-search.ts
│   │   ├── memory-list.ts
│   │   ├── memory-delete.ts
│   │   └── memory-update.ts
│   └── migrate.ts              # script de migração dos arquivos existentes
└── supabase/
    └── 001_memories.sql
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/package.json`
- Create: `C:/Users/rodri/claude-memory-mcp/tsconfig.json`
- Create: `C:/Users/rodri/claude-memory-mcp/.env`
- Create: `C:/Users/rodri/claude-memory-mcp/.gitignore`

- [ ] **Step 1: Criar diretório e package.json**

```bash
mkdir -p "C:/Users/rodri/claude-memory-mcp/src/lib"
mkdir -p "C:/Users/rodri/claude-memory-mcp/src/tools"
mkdir -p "C:/Users/rodri/claude-memory-mcp/supabase"
cd "C:/Users/rodri/claude-memory-mcp"
```

Criar `package.json`:
```json
{
  "name": "claude-memory-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "@supabase/supabase-js": "^2.49.4",
    "openai": "^4.96.0",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "tsx": "^4.19.3",
    "typescript": "^5.8.3",
    "@types/node": "^22.15.3"
  }
}
```

- [ ] **Step 2: Criar tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Criar .env**

```env
SUPABASE_URL=https://haeogvqaiqzakqossnjc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
OPENAI_API_KEY=sk-COLOQUE_SUA_CHAVE_AQUI
```

> **Ação necessária:** substituir `sk-COLOQUE_SUA_CHAVE_AQUI` pela sua OpenAI API key real.

- [ ] **Step 4: Criar .gitignore**

```
.env
node_modules/
dist/
```

- [ ] **Step 5: Instalar dependências**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npm install
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
git init
git add package.json tsconfig.json .gitignore
git commit -m "chore: initial project scaffold for claude-memory-mcp"
```

---

### Task 2: Supabase Migration

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/supabase/001_memories.sql`

- [ ] **Step 1: Criar arquivo SQL**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main memories table
CREATE TABLE IF NOT EXISTS memories (
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

-- Semantic search index (ivfflat for cosine similarity)
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Utility indexes
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories (type);
CREATE INDEX IF NOT EXISTS memories_project_idx ON memories (project);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Aplicar no Supabase**

Acesse o Supabase Dashboard do projeto claude-memory:
- URL: `https://supabase.com/dashboard/project/haeogvqaiqzakqossnjc`
- Vá em **SQL Editor** → **New query**
- Cole o conteúdo do arquivo e clique **Run**

Saída esperada: `Success. No rows returned`

- [ ] **Step 3: Verificar tabela**

No Supabase Dashboard → **Table Editor** → confirmar que a tabela `memories` aparece com as colunas corretas.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
git add supabase/001_memories.sql
git commit -m "feat(db): memories table with pgvector and ivfflat index"
```

---

### Task 3: Lib Layer (Supabase + Embeddings)

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/types.ts`
- Create: `C:/Users/rodri/claude-memory-mcp/src/lib/supabase.ts`
- Create: `C:/Users/rodri/claude-memory-mcp/src/lib/embeddings.ts`

- [ ] **Step 1: Criar types.ts**

```typescript
export interface Memory {
  id: string;
  type: 'user' | 'feedback' | 'project' | 'reference' | 'conversation';
  title: string;
  content: string;
  embedding?: number[];
  project: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Criar src/lib/supabase.ts**

```typescript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env');
}

export const supabase = createClient(url, key);
```

- [ ] **Step 3: Criar src/lib/embeddings.ts**

```typescript
import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY é obrigatório no .env');
}

const openai = new OpenAI({ apiKey });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // limite seguro
  });
  return response.data[0].embedding;
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npx tsc --noEmit 2>&1
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/supabase.ts src/lib/embeddings.ts
git commit -m "feat: supabase client and OpenAI embedding lib"
```

---

### Task 4: MCP Server Entry Point

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/index.ts`

- [ ] **Step 1: Criar src/index.ts**

```typescript
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { handleMemorySave, memorySaveTool } from './tools/memory-save.js';
import { handleMemorySearch, memorySearchTool } from './tools/memory-search.js';
import { handleMemoryList, memoryListTool } from './tools/memory-list.js';
import { handleMemoryDelete, memoryDeleteTool } from './tools/memory-delete.js';
import { handleMemoryUpdate, memoryUpdateTool } from './tools/memory-update.js';

const server = new Server(
  { name: 'claude-memory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    memorySaveTool,
    memorySearchTool,
    memoryListTool,
    memoryDeleteTool,
    memoryUpdateTool,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'memory_save':   return handleMemorySave(args as any);
    case 'memory_search': return handleMemorySearch(args as any);
    case 'memory_list':   return handleMemoryList(args as any);
    case 'memory_delete': return handleMemoryDelete(args as any);
    case 'memory_update': return handleMemoryUpdate(args as any);
    default: throw new Error(`Tool desconhecida: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npx tsc --noEmit 2>&1
```

Esperado: erros apenas de "module not found" para os tools (ainda não criados) — sem erros de sintaxe no index.ts.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: MCP server entry point with tool routing"
```

---

### Task 5: memory_save Tool

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/tools/memory-save.ts`

- [ ] **Step 1: Criar src/tools/memory-save.ts**

```typescript
import { supabase } from '../lib/supabase.js';
import { generateEmbedding } from '../lib/embeddings.js';
import type { Memory } from '../types.js';

export const memorySaveTool = {
  name: 'memory_save',
  description: 'Salva uma memória persistente. Use para guardar informações sobre projetos, preferências do usuário, feedback recebido, decisões tomadas ou resumos de conversas.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['user', 'feedback', 'project', 'reference', 'conversation'],
        description: 'user=perfil do usuário, feedback=correções/preferências, project=contexto de projeto, reference=ponteiros externos, conversation=resumo de sessão',
      },
      title: { type: 'string', description: 'Título curto e descritivo (ex: "SquadOS VPS Deploy")' },
      content: { type: 'string', description: 'Conteúdo completo da memória' },
      project: { type: 'string', description: 'Nome do projeto (ex: squados, livecrm). Default: global' },
      session_id: { type: 'string', description: 'ID da sessão atual (opcional)' },
    },
    required: ['type', 'title', 'content'],
  },
};

export async function handleMemorySave(args: {
  type: Memory['type'];
  title: string;
  content: string;
  project?: string;
  session_id?: string;
}) {
  const embedding = await generateEmbedding(`${args.title}\n${args.content}`);

  const { data, error } = await supabase
    .from('memories')
    .insert({
      type: args.type,
      title: args.title,
      content: args.content,
      embedding,
      project: args.project ?? 'global',
      session_id: args.session_id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { content: [{ type: 'text' as const, text: `Erro ao salvar: ${error.message}` }] };
  }

  return {
    content: [{ type: 'text' as const, text: `Memória salva com id: ${data.id}` }],
  };
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npx tsc --noEmit 2>&1
```

Esperado: sem erros (exceto tools ainda não criados).

- [ ] **Step 3: Commit**

```bash
git add src/tools/memory-save.ts
git commit -m "feat: memory_save tool with embedding generation"
```

---

### Task 6: memory_search Tool

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/tools/memory-search.ts`

- [ ] **Step 1: Criar src/tools/memory-search.ts**

```typescript
import { supabase } from '../lib/supabase.js';
import { generateEmbedding } from '../lib/embeddings.js';

export const memorySearchTool = {
  name: 'memory_search',
  description: 'Busca semântica nas memórias. Use para encontrar contexto relevante sobre projetos, preferências ou conversas anteriores.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'O que você quer encontrar, em linguagem natural' },
      limit: { type: 'number', description: 'Número máximo de resultados. Default: 5' },
      project: { type: 'string', description: 'Filtrar por projeto (omitir = todos)' },
      type: {
        type: 'string',
        enum: ['user', 'feedback', 'project', 'reference', 'conversation'],
        description: 'Filtrar por tipo (omitir = todos)',
      },
    },
    required: ['query'],
  },
};

export async function handleMemorySearch(args: {
  query: string;
  limit?: number;
  project?: string;
  type?: string;
}) {
  const embedding = await generateEmbedding(args.query);
  const limit = args.limit ?? 5;

  // Supabase RPC for vector similarity search
  let query = supabase.rpc('match_memories', {
    query_embedding: embedding,
    match_count: limit,
  });

  // Note: filtragem por project/type é feita pós-RPC pois a função RPC retorna todos
  const { data, error } = await query;

  if (error) {
    return { content: [{ type: 'text' as const, text: `Erro na busca: ${error.message}` }] };
  }

  let results = (data ?? []) as Array<{
    id: string; type: string; title: string; content: string;
    project: string; session_id: string | null; created_at: string; similarity: number;
  }>;

  if (args.project) results = results.filter((r) => r.project === args.project);
  if (args.type)    results = results.filter((r) => r.type === args.type);

  if (results.length === 0) {
    return { content: [{ type: 'text' as const, text: 'Nenhuma memória encontrada.' }] };
  }

  const formatted = results.map((r) =>
    `[${r.type.toUpperCase()}] ${r.title} (${r.project}) — similaridade: ${(r.similarity * 100).toFixed(0)}%\n${r.content}`
  ).join('\n\n---\n\n');

  return { content: [{ type: 'text' as const, text: formatted }] };
}
```

- [ ] **Step 2: Criar a função RPC `match_memories` no Supabase**

No Supabase Dashboard → SQL Editor → New query, executar:

```sql
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  content text,
  project text,
  session_id text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, type, title, content, project, session_id, created_at,
    1 - (embedding <=> query_embedding) AS similarity
  FROM memories
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
git add src/tools/memory-search.ts
git commit -m "feat: memory_search tool with semantic similarity via pgvector RPC"
```

---

### Task 7: memory_list, memory_delete, memory_update Tools

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/tools/memory-list.ts`
- Create: `C:/Users/rodri/claude-memory-mcp/src/tools/memory-delete.ts`
- Create: `C:/Users/rodri/claude-memory-mcp/src/tools/memory-update.ts`

- [ ] **Step 1: Criar src/tools/memory-list.ts**

```typescript
import { supabase } from '../lib/supabase.js';

export const memoryListTool = {
  name: 'memory_list',
  description: 'Lista memórias salvas, opcionalmente filtradas por tipo ou projeto.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['user', 'feedback', 'project', 'reference', 'conversation'],
        description: 'Filtrar por tipo',
      },
      project: { type: 'string', description: 'Filtrar por projeto' },
      limit: { type: 'number', description: 'Máximo de resultados. Default: 20' },
    },
  },
};

export async function handleMemoryList(args: {
  type?: string;
  project?: string;
  limit?: number;
}) {
  let query = supabase
    .from('memories')
    .select('id, type, title, project, created_at')
    .order('updated_at', { ascending: false })
    .limit(args.limit ?? 20);

  if (args.type)    query = query.eq('type', args.type);
  if (args.project) query = query.eq('project', args.project);

  const { data, error } = await query;
  if (error) {
    return { content: [{ type: 'text' as const, text: `Erro: ${error.message}` }] };
  }

  if (!data || data.length === 0) {
    return { content: [{ type: 'text' as const, text: 'Nenhuma memória encontrada.' }] };
  }

  const formatted = data.map((r) =>
    `${r.id} | [${r.type}] ${r.title} (${r.project}) — ${new Date(r.created_at).toLocaleDateString('pt-BR')}`
  ).join('\n');

  return { content: [{ type: 'text' as const, text: formatted }] };
}
```

- [ ] **Step 2: Criar src/tools/memory-delete.ts**

```typescript
import { supabase } from '../lib/supabase.js';

export const memoryDeleteTool = {
  name: 'memory_delete',
  description: 'Remove uma memória pelo ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'UUID da memória a remover' },
    },
    required: ['id'],
  },
};

export async function handleMemoryDelete(args: { id: string }) {
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', args.id);

  if (error) {
    return { content: [{ type: 'text' as const, text: `Erro: ${error.message}` }] };
  }

  return { content: [{ type: 'text' as const, text: `Memória ${args.id} removida.` }] };
}
```

- [ ] **Step 3: Criar src/tools/memory-update.ts**

```typescript
import { supabase } from '../lib/supabase.js';
import { generateEmbedding } from '../lib/embeddings.js';

export const memoryUpdateTool = {
  name: 'memory_update',
  description: 'Atualiza o conteúdo de uma memória existente. Re-gera o embedding automaticamente.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'UUID da memória a atualizar' },
      content: { type: 'string', description: 'Novo conteúdo completo' },
      title: { type: 'string', description: 'Novo título (opcional)' },
    },
    required: ['id', 'content'],
  },
};

export async function handleMemoryUpdate(args: {
  id: string;
  content: string;
  title?: string;
}) {
  const { data: existing } = await supabase
    .from('memories')
    .select('title')
    .eq('id', args.id)
    .single();

  if (!existing) {
    return { content: [{ type: 'text' as const, text: 'Memória não encontrada.' }] };
  }

  const title = args.title ?? existing.title;
  const embedding = await generateEmbedding(`${title}\n${args.content}`);

  const { error } = await supabase
    .from('memories')
    .update({ title, content: args.content, embedding })
    .eq('id', args.id);

  if (error) {
    return { content: [{ type: 'text' as const, text: `Erro: ${error.message}` }] };
  }

  return { content: [{ type: 'text' as const, text: `Memória ${args.id} atualizada.` }] };
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npx tsc --noEmit 2>&1
```

Esperado: zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/tools/memory-list.ts src/tools/memory-delete.ts src/tools/memory-update.ts
git commit -m "feat: memory_list, memory_delete, memory_update tools"
```

---

### Task 8: Migration Script (Importar Arquivos Existentes)

**Files:**
- Create: `C:/Users/rodri/claude-memory-mcp/src/migrate.ts`

- [ ] **Step 1: Criar src/migrate.ts**

```typescript
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { supabase } from './lib/supabase.js';
import { generateEmbedding } from './lib/embeddings.js';
import type { Memory } from './types.js';

const MEMORY_DIR = 'G:/Meu Drive/GOOGLEDRIVE/.claude-memory';

function inferType(filename: string): Memory['type'] {
  if (filename.startsWith('feedback')) return 'feedback';
  if (filename.startsWith('reference')) return 'reference';
  if (filename.startsWith('project')) return 'project';
  if (filename.startsWith('user')) return 'user';
  return 'reference';
}

function inferProject(filename: string): string {
  if (filename.includes('squados')) return 'squados';
  if (filename.includes('livecrm')) return 'livecrm';
  if (filename.includes('socialmedia') || filename.includes('live')) return 'live-universe';
  if (filename.includes('calculador')) return 'calculador-custo';
  return 'global';
}

async function run() {
  const files = readdirSync(MEMORY_DIR).filter(
    (f) => f.endsWith('.md') && f !== 'MEMORY.md'
  );

  console.log(`Encontrados ${files.length} arquivos para migrar...`);

  for (const file of files) {
    const content = readFileSync(join(MEMORY_DIR, file), 'utf-8');

    // Extract title from frontmatter "name:" field or first H1
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = nameMatch?.[1]?.trim() ?? h1Match?.[1]?.trim() ?? file.replace('.md', '');

    // Strip frontmatter for content
    const cleanContent = content.replace(/^---[\s\S]*?---\n/, '').trim();

    const type = inferType(file);
    const project = inferProject(file);

    console.log(`  Migrando: ${file} → [${type}] ${title} (${project})`);

    try {
      const embedding = await generateEmbedding(`${title}\n${cleanContent}`);

      const { error } = await supabase.from('memories').insert({
        type,
        title,
        content: cleanContent,
        embedding,
        project,
        session_id: null,
      });

      if (error) {
        console.error(`    ❌ Erro: ${error.message}`);
      } else {
        console.log(`    ✅ OK`);
      }
    } catch (e) {
      console.error(`    ❌ Exceção: ${e}`);
    }

    // Rate limit: 1 req/s para OpenAI embeddings
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('Migração concluída.');
}

run();
```

- [ ] **Step 2: Executar a migração**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
npm run migrate
```

Saída esperada: cada arquivo com ✅ OK. Verifica no Supabase Table Editor que as linhas foram inseridas.

- [ ] **Step 3: Commit**

```bash
git add src/migrate.ts
git commit -m "feat: migration script to import existing .claude-memory files"
```

---

### Task 9: Registro Global + Teste

**Files:**
- Modify: `C:/Users/rodri/.claude/settings.json`

- [ ] **Step 1: Ler settings.json atual**

```bash
cat "C:/Users/rodri/.claude/settings.json"
```

- [ ] **Step 2: Adicionar mcpServers ao settings.json**

Localizar o objeto raiz e adicionar a chave `mcpServers`. O arquivo completo deve incluir:

```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "npx",
      "args": ["tsx", "C:/Users/rodri/claude-memory-mcp/src/index.ts"],
      "env": {
        "SUPABASE_URL": "https://haeogvqaiqzakqossnjc.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<SUPABASE_SERVICE_ROLE_KEY>",
        "OPENAI_API_KEY": "sk-COLOQUE_SUA_CHAVE_AQUI"
      }
    }
  }
}
```

> Manter todas as outras chaves existentes no arquivo — só adicionar `mcpServers`.
> Substituir `sk-COLOQUE_SUA_CHAVE_AQUI` pela chave OpenAI real.

- [ ] **Step 3: Testar o servidor manualmente**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx tsx src/index.ts
```

Saída esperada: JSON com lista de 5 tools (`memory_save`, `memory_search`, `memory_list`, `memory_delete`, `memory_update`).

- [ ] **Step 4: Reiniciar Claude Code**

Fechar e reabrir o Claude Code (ou VS Code com extensão Claude). O MCP server aparecerá automaticamente nas tools disponíveis.

- [ ] **Step 5: Testar uma busca real**

Numa nova conversa do Claude Code, usar:
```
/mcp memory_search {"query": "SquadOS deploy VPS"}
```

Saída esperada: resultado com a memória do deploy VPS importada na Task 8.

- [ ] **Step 6: Commit final**

```bash
cd "C:/Users/rodri/claude-memory-mcp"
git add .
git commit -m "feat: complete Claude Memory MCP server with 5 tools and migration"
```
