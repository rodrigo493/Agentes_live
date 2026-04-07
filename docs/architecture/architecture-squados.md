# Arquitetura Técnica — SquadOS

> **Produto:** SquadOS
> **Versão:** 1.0.0
> **Data:** 2026-04-07
> **Autor:** @architect (Aria)
> **Stack:** Next.js 15 + TypeScript + Supabase + Tailwind CSS
> **Deploy:** VPS Linux — squad.liveuni.com.br

---

## 1. Visão Consolidada do Produto

O SquadOS é um **sistema operacional corporativo** que une:

1. **Comunicação interna** (workspace tipo WhatsApp: 1:1 + grupos)
2. **Chat com agentes IA** especializados por setor
3. **Base de conhecimento** setorizada com memória contínua
4. **Camada executiva** para agentes de IA estratégicos
5. **Auditoria e governança** em 4 camadas de segurança

**Princípio arquitetural:** O sistema é a **plataforma de dados e comunicação**. A inteligência dos agentes será acoplada via **OpenSquad** posteriormente. O SquadOS fornece: autenticação, autorização, persistência, mensageria em tempo real e a API de acesso ao conhecimento/memória.

---

## 2. Arquitetura Recomendada

### 2.1 Visão Macro

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                         │
│  Next.js App (SSR/CSR) — Tailwind — Zustand — React Query       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS (TLS 1.3)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     VPS — squad.liveuni.com.br                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Next.js Server (Node.js 20 LTS)              │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ Server       │  │ Route        │  │ Middleware      │  │  │
│  │  │ Actions      │  │ Handlers     │  │ (Auth+RBAC)    │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │  │
│  │         │                │                    │           │  │
│  │         ▼                ▼                    ▼           │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │           Service Layer (Business Logic)         │     │  │
│  │  │  auth · users · sectors · messages · memory      │     │  │
│  │  │  groups · knowledge · agents · audit             │     │  │
│  │  └─────────────────────┬───────────────────────────┘     │  │
│  │                        │                                  │  │
│  │         ┌──────────────┼──────────────┐                  │  │
│  │         ▼              ▼              ▼                   │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐            │  │
│  │  │ Supabase  │  │ Supabase  │  │ Supabase  │            │  │
│  │  │ Auth      │  │ Postgres  │  │ Storage   │            │  │
│  │  │ (JWT)     │  │ (RLS)     │  │ (Files)   │            │  │
│  │  └───────────┘  └───────────┘  └───────────┘            │  │
│  │                        │                                  │  │
│  │                        ▼                                  │  │
│  │               ┌────────────────┐                         │  │
│  │               │ Supabase       │                         │  │
│  │               │ Realtime       │                         │  │
│  │               │ (WebSocket)    │                         │  │
│  │               └────────────────┘                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Nginx    │  │ PM2      │  │ Certbot  │  │ PostgreSQL   │   │
│  │ Reverse  │  │ Process  │  │ SSL/TLS  │  │ Backups      │   │
│  │ Proxy    │  │ Manager  │  │ Auto     │  │ (cron)       │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  OpenSquad (Futuro - Externo)                    │
│  Agentes especialistas + executivos conectam via API             │
│  Consomem: memória, conhecimento, contexto, mensagens           │
│  Produzem: respostas, análises, alertas, sugestões              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Decisões Arquiteturais

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Framework | Next.js 15 (App Router) | SSR + Server Actions + API routes num único deploy |
| Runtime | Node.js 20 LTS | Estabilidade, compatibilidade com Supabase SDK |
| Auth | Supabase Auth | JWT nativo, RLS integrado, 2FA built-in |
| Database | Supabase PostgreSQL | RLS nativo, Realtime, pgvector para embeddings futuros |
| Storage | Supabase Storage | Buckets com RLS, integrado ao auth |
| Realtime | Supabase Realtime | WebSocket nativo para chat, presence, typing |
| Styling | Tailwind CSS + shadcn/ui | Consistência, acessibilidade, composabilidade |
| State | Zustand + React Query | Zustand para UI state, React Query para server state |
| Validation | Zod | Schema validation compartilhada client/server |
| Process Manager | PM2 | Zero-downtime deploys, auto-restart, logs |
| Reverse Proxy | Nginx | TLS termination, rate limiting, static files |
| SSL | Certbot (Let's Encrypt) | Gratuito, auto-renovação |

### 2.3 Padrão Arquitetural

**Monólito Modular com Feature-Based Architecture:**

Cada módulo é uma feature isolada com contrato público. Comunicação entre features ocorre APENAS via contratos, nunca por imports diretos de implementação.

```
src/features/{feature}/
├── {feature}.contract.ts    # API pública da feature
├── actions/                  # Server Actions
├── components/               # React components
├── hooks/                    # Custom hooks
├── lib/                      # Business logic (services, utils)
├── types/                    # TypeScript types
└── __tests__/                # Testes
```

---

## 3. Estrutura de Pastas do Projeto

```
squados/
├── .env.local                    # Secrets (NUNCA no git)
├── .env.example                  # Template de env vars
├── next.config.ts                # Configuração Next.js
├── tailwind.config.ts            # Tailwind config
├── tsconfig.json                 # TypeScript config
├── package.json
├── middleware.ts                  # Auth + RBAC middleware (CAMADA 2)
│
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout (providers)
│   │   ├── page.tsx              # Landing/redirect
│   │   ├── (auth)/               # Grupo: páginas públicas
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   ├── (app)/                # Grupo: páginas autenticadas
│   │   │   ├── layout.tsx        # App shell (sidebar + header)
│   │   │   ├── dashboard/        # Home do usuário
│   │   │   ├── chat/             # Chat com agente do setor
│   │   │   │   └── [conversationId]/
│   │   │   ├── workspace/        # Workspace corporativo
│   │   │   │   ├── contacts/     # Lista de contatos
│   │   │   │   ├── dm/           # Direct messages
│   │   │   │   │   └── [userId]/
│   │   │   │   └── groups/       # Grupos
│   │   │   │       └── [groupId]/
│   │   │   ├── knowledge/        # Base de conhecimento
│   │   │   │   └── [sectorSlug]/
│   │   │   └── settings/         # Configurações pessoais
│   │   └── (admin)/              # Grupo: admin pages
│   │       ├── layout.tsx        # Admin layout + guard
│   │       ├── users/            # Gestão de usuários
│   │       ├── sectors/          # Gestão de setores
│   │       ├── groups/           # Gestão de grupos
│   │       ├── permissions/      # Gestão de permissões
│   │       ├── ingestion/        # Ingestão de conteúdos
│   │       └── audit/            # Logs de auditoria
│   │
│   ├── features/                 # Feature modules
│   │   ├── auth/                 # Autenticação
│   │   │   ├── auth.contract.ts
│   │   │   ├── actions/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   ├── users/                # Gestão de usuários
│   │   │   ├── users.contract.ts
│   │   │   ├── actions/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   ├── sectors/              # Setores
│   │   │   ├── sectors.contract.ts
│   │   │   └── ...
│   │   ├── permissions/          # RBAC
│   │   │   ├── permissions.contract.ts
│   │   │   └── ...
│   │   ├── chat-agent/           # Chat com agente
│   │   │   ├── chat-agent.contract.ts
│   │   │   └── ...
│   │   ├── workspace/            # Workspace corporativo
│   │   │   ├── workspace.contract.ts
│   │   │   └── ...
│   │   ├── groups/               # Grupos
│   │   │   ├── groups.contract.ts
│   │   │   └── ...
│   │   ├── knowledge/            # Base de conhecimento
│   │   │   ├── knowledge.contract.ts
│   │   │   └── ...
│   │   ├── memory/               # Memória operacional
│   │   │   ├── memory.contract.ts
│   │   │   └── ...
│   │   ├── agents/               # Registro de agentes
│   │   │   ├── agents.contract.ts
│   │   │   └── ...
│   │   └── audit/                # Auditoria
│   │       ├── audit.contract.ts
│   │       └── ...
│   │
│   ├── shared/                   # Código compartilhado
│   │   ├── components/           # UI components (shadcn/ui)
│   │   │   ├── ui/               # Base components
│   │   │   └── layout/           # Layout components
│   │   ├── hooks/                # Hooks compartilhados
│   │   ├── lib/                  # Utilities
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts     # Browser client
│   │   │   │   ├── server.ts     # Server client
│   │   │   │   └── admin.ts      # Service role client (NUNCA no frontend)
│   │   │   ├── rbac/             # RBAC engine
│   │   │   │   ├── permissions.ts
│   │   │   │   ├── roles.ts
│   │   │   │   └── guards.ts
│   │   │   ├── validation/       # Zod schemas compartilhados
│   │   │   └── utils/            # Helpers genéricos
│   │   └── types/                # Types globais
│   │       ├── database.ts       # Generated from Supabase
│   │       ├── auth.ts
│   │       └── enums.ts
│   │
│   └── config/                   # Configurações da app
│       ├── constants.ts          # Constantes
│       ├── navigation.ts         # Menu items + permissões (CAMADA 1)
│       └── sectors.ts            # Setores iniciais
│
├── supabase/                     # Supabase local
│   ├── config.toml               # Config do Supabase
│   ├── migrations/               # SQL migrations
│   │   ├── 00001_create_profiles.sql
│   │   ├── 00002_create_sectors.sql
│   │   ├── 00003_create_permissions.sql
│   │   ├── 00004_create_conversations.sql
│   │   ├── 00005_create_messages.sql
│   │   ├── 00006_create_groups.sql
│   │   ├── 00007_create_knowledge.sql
│   │   ├── 00008_create_memory.sql
│   │   ├── 00009_create_agents.sql
│   │   ├── 00010_create_audit.sql
│   │   └── 00011_seed_sectors.sql
│   └── seed.sql                  # Seed data
│
├── scripts/                      # Scripts de operação
│   ├── deploy.sh                 # Deploy na VPS
│   ├── backup.sh                 # Backup do banco
│   └── setup-vps.sh              # Setup inicial da VPS
│
├── docs/                         # Documentação (AIOX)
│   ├── prd/
│   ├── architecture/
│   ├── stories/
│   └── guides/
│
└── tests/                        # Testes E2E
    └── e2e/
```

---

## 4. Estratégia de Autenticação e Autorização

### 4.1 Fluxo de Autenticação

```
Browser → Login Form → Server Action → Supabase Auth → JWT
                                                          │
                                                          ▼
                                                    Cookie HTTP-only
                                                    (secure, samesite=lax)
                                                          │
                                                          ▼
                                                    Middleware verifica
                                                    JWT em cada request
```

**Regras:**
- JWT armazenado em cookie HTTP-only (NUNCA em localStorage)
- Refresh token rotativo automático via Supabase
- Sessão expira em 1h (access token), refresh em 7 dias
- 2FA via TOTP para admin/master_admin (Supabase MFA)

### 4.2 Modelo RBAC — 4 Camadas de Acesso

```
CAMADA 1: Menu/Interface
├── navigation.ts define quais itens cada role vê
├── Componentes condicionais por role
└── NÃO é segurança real — é UX

CAMADA 2: Rotas (middleware.ts)
├── Protege route groups inteiros
├── Redireciona unauthorized para /login
├── Verifica role mínimo por rota
└── Bloqueia antes do render

CAMADA 3: API / Server Actions
├── Cada action verifica auth + role + setor + escopo
├── Validação Zod de todos os inputs
├── Rate limiting por IP/usuário
└── Lógica de negócio NUNCA exposta ao client

CAMADA 4: Banco de Dados (RLS)
├── Policies por user_id, role, sector_id
├── Última linha de defesa
├── Mesmo com bypass de API, dados seguros
└── NENHUMA tabela sensível sem RLS
```

### 4.3 Matriz de Permissões por Role

| Recurso | master_admin | admin | manager | operator | viewer |
|---------|:---:|:---:|:---:|:---:|:---:|
| Ver todos os setores | Yes | Yes | Proprio | Proprio | Proprio |
| Criar usuários | Yes | Yes | No | No | No |
| Editar usuários | Yes | Yes | Setor | No | No |
| Desativar usuários | Yes | Yes | No | No | No |
| Criar grupos | Yes | Yes | No | No | No |
| Gerenciar grupos | Yes | Yes | No | No | No |
| Chat com agente | Yes | Yes | Yes | Yes | No |
| Workspace (1:1) | Yes | Yes | Yes | Yes | Read |
| Workspace (grupos) | Yes | Yes | Participante | Participante | No |
| Ingerir conteúdos | Yes | Yes | Setor | No | No |
| Ver auditoria | Yes | Yes | No | No | No |
| Configurar sistema | Yes | No | No | No | No |
| Ver dados de todos setores | Yes | Conforme escopo | No | No | No |
| Acessar painel executivo | Yes | No | No | No | No |

### 4.4 Escopo de Acesso a Mensagens

```yaml
# Chat com Agente
chat_agent:
  user: "lê/escreve apenas suas conversas com agente do seu setor"
  agent_setor: "acessa todas as conversas do setor como contexto"
  admin: "pode auditar conforme permissões"
  agent_executivo: "acesso total conforme governança"

# Workspace — DM (1:1)
workspace_dm:
  user: "lê/escreve apenas suas DMs"
  agent_setor: "acessa mensagens dos seus usuários (conforme política)"
  admin: "pode auditar conforme permissões"
  agent_executivo: "acesso consolidado"

# Workspace — Grupo
workspace_group:
  participant: "lê/escreve mensagens do grupo"
  agent_setor_principal: "acesso completo ao contexto do grupo"
  agent_setor_participante: "acessa mensagens dos seus usuários no grupo"
  admin: "pode auditar conforme permissões"
  agent_executivo: "acesso total"
```

---

## 5. Modelagem Inicial de Banco de Dados

### 5.1 Diagrama Entidade-Relacionamento

```
                    ┌──────────────┐
                    │  auth.users  │ (Supabase managed)
                    │  id (uuid)   │
                    └──────┬───────┘
                           │ 1:1
                           ▼
                    ┌──────────────┐
                    │   profiles   │
                    │──────────────│        ┌──────────────┐
                    │ id           │───────▶│   sectors    │
                    │ full_name    │  N:1   │──────────────│
                    │ role         │        │ id           │
                    │ sector_id    │        │ name         │
                    │ status       │        │ slug         │
                    │ avatar_url   │        │ description  │
                    │ phone        │        │ area         │
                    └──────┬───────┘        │ agent_id     │──▶ agents
                           │               └──────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌───────────┐   ┌─────────────┐
   │conversations│  │  group_   │   │   audit_    │
   │─────────────│  │  members  │   │   logs      │
   │ id          │  │───────────│   │─────────────│
   │ type        │  │ group_id  │   │ id          │
   │ (agent/dm/  │  │ user_id   │   │ user_id     │
   │  group)     │  │ role      │   │ action      │
   │ sector_id   │  │ joined_at │   │ resource    │
   │ group_id    │  └───────────┘   │ details     │
   │ metadata    │                   │ ip_address  │
   └──────┬──────┘                   └─────────────┘
          │ 1:N
          ▼
   ┌─────────────┐
   │  messages   │
   │─────────────│       ┌──────────────────┐
   │ id          │       │  knowledge_docs  │
   │ conversation│       │──────────────────│
   │  _id        │       │ id               │
   │ sender_id   │       │ sector_id        │
   │ content     │       │ title            │
   │ type        │       │ content          │
   │ metadata    │       │ doc_type         │
   │ created_at  │       │ storage_path     │
   │ edited_at   │       │ uploaded_by      │
   └─────────────┘       └──────────────────┘

   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ processed_memory │  │ knowledge_memory │  │     agents       │
   │──────────────────│  │──────────────────│  │──────────────────│
   │ id               │  │ id               │  │ id               │
   │ sector_id        │  │ sector_id        │  │ sector_id        │
   │ source_type      │  │ source_memory_id │  │ name             │
   │ source_id        │→→│ title            │  │ type             │
   │ content          │  │ content          │  │ context_policy   │
   │ summary          │  │ category         │  │ access_level     │
   │ processing_status│  │ confidence_score │  │ config           │
   │ relevance_score  │  │ validation_status│  │ status           │
   │ tags             │  │ embedding (vec)  │  └──────────────────┘
   └──────────────────┘  │ tags             │
                         └──────────────────┘

   FLUXO: messages (raw) → processed_memory → knowledge_memory → agentes

   ┌─────────────────────┐
   │      groups         │
   │─────────────────────│
   │ id                  │
   │ name                │
   │ description         │
   │ sector_id (optional)│
   │ created_by          │
   │ avatar_url          │
   │ status              │
   └─────────────────────┘
```

### 5.2 Tabelas Principais

#### `profiles` (extensão do auth.users)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'operator',
  sector_id UUID REFERENCES sectors(id),
  status user_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  phone TEXT,
  two_factor_enabled BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete
);

CREATE TYPE user_role AS ENUM (
  'master_admin', 'admin', 'manager', 'operator', 'viewer'
);

CREATE TYPE user_status AS ENUM (
  'active', 'inactive', 'suspended'
);
```

#### `sectors`
```sql
CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  area TEXT, -- Produção, Qualidade, Financeiro, etc.
  icon TEXT,
  agent_id UUID REFERENCES agents(id),
  parent_sector_id UUID REFERENCES sectors(id), -- hierarquia futura
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `conversations`
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL,
  sector_id UUID REFERENCES sectors(id), -- para type=agent
  group_id UUID REFERENCES groups(id),   -- para type=group
  participant_ids UUID[] NOT NULL,        -- para type=dm
  title TEXT,
  metadata JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE conversation_type AS ENUM ('agent', 'dm', 'group');
```

#### `messages`
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id), -- NULL = system/agent message
  sender_type message_sender_type NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}', -- { agent_context, attachments futuro, etc }
  reply_to_id UUID REFERENCES messages(id),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ
);

CREATE TYPE message_sender_type AS ENUM ('user', 'agent', 'system');
CREATE TYPE message_content_type AS ENUM ('text', 'system', 'file', 'image');

-- Índices para performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
```

#### `groups`
```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sector_id UUID REFERENCES sectors(id), -- setor principal
  created_by UUID NOT NULL REFERENCES profiles(id),
  avatar_url TEXT,
  status group_status NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE group_status AS ENUM ('active', 'archived');
```

#### `group_members`
```sql
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role group_member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES profiles(id),
  UNIQUE(group_id, user_id)
);

CREATE TYPE group_member_role AS ENUM ('admin', 'member');
```

#### `knowledge_docs` (Base de Conhecimento)
```sql
CREATE TABLE knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  title TEXT NOT NULL,
  content TEXT,
  doc_type knowledge_doc_type NOT NULL,
  storage_path TEXT, -- path no Supabase Storage
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE knowledge_doc_type AS ENUM (
  'transcript',   -- transcrição de reunião
  'document',     -- documento geral
  'procedure',    -- procedimento operacional
  'manual',       -- manual técnico
  'note',         -- anotação
  'other'
);

CREATE INDEX idx_knowledge_sector ON knowledge_docs(sector_id);
CREATE INDEX idx_knowledge_tags ON knowledge_docs USING GIN(tags);
```

#### `processed_memory` (Memória Processada — Camada 2)
```sql
CREATE TABLE processed_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_type memory_source_type NOT NULL,
  source_id UUID, -- conversation_id ou message_id de origem
  content TEXT NOT NULL, -- conteúdo filtrado/resumido
  summary TEXT, -- resumo curto para busca rápida
  user_id UUID REFERENCES profiles(id), -- quem originou
  context JSONB NOT NULL DEFAULT '{}', -- { canal, grupo, setor, conversa }
  tags TEXT[] NOT NULL DEFAULT '{}',
  relevance_score FLOAT NOT NULL DEFAULT 0.5,
  processing_status memory_processing_status NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE memory_source_type AS ENUM (
  'chat_agent', 'workspace_dm', 'workspace_group',
  'knowledge_doc', 'transcript', 'manual_entry'
);

CREATE TYPE memory_processing_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'rejected'
);

CREATE INDEX idx_processed_memory_sector ON processed_memory(sector_id);
CREATE INDEX idx_processed_memory_source ON processed_memory(source_type, source_id);
CREATE INDEX idx_processed_memory_status ON processed_memory(processing_status);
CREATE INDEX idx_processed_memory_tags ON processed_memory USING GIN(tags);
```

#### `knowledge_memory` (Memória Validada — Camada 3)
```sql
CREATE TABLE knowledge_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  source_memory_id UUID REFERENCES processed_memory(id), -- rastreabilidade
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- conhecimento validado e estruturado
  category knowledge_category NOT NULL DEFAULT 'general',
  confidence_score FLOAT NOT NULL DEFAULT 0.7,
  validated_by UUID REFERENCES profiles(id), -- quem validou (NULL = auto)
  validation_status knowledge_validation_status NOT NULL DEFAULT 'auto_validated',
  tags TEXT[] NOT NULL DEFAULT '{}',
  embedding VECTOR(1536), -- pgvector para busca semântica
  expires_at TIMESTAMPTZ, -- conhecimento com validade (opcional)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE knowledge_category AS ENUM (
  'procedure', 'policy', 'technical', 'operational',
  'decision', 'lesson_learned', 'faq', 'general'
);

CREATE TYPE knowledge_validation_status AS ENUM (
  'auto_validated', 'human_validated', 'pending_review', 'rejected'
);

CREATE INDEX idx_knowledge_memory_sector ON knowledge_memory(sector_id);
CREATE INDEX idx_knowledge_memory_category ON knowledge_memory(category);
CREATE INDEX idx_knowledge_memory_validation ON knowledge_memory(validation_status);
CREATE INDEX idx_knowledge_memory_tags ON knowledge_memory USING GIN(tags);
-- Futuro: CREATE INDEX idx_knowledge_memory_embedding ON knowledge_memory
--   USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

#### `agents` (Registro de Agentes)
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  type agent_type NOT NULL,
  sector_id UUID REFERENCES sectors(id), -- NULL para executivos
  description TEXT,
  config JSONB DEFAULT '{}', -- configurações do agente (model, temperature, etc)
  system_prompt TEXT,
  access_level agent_access_level NOT NULL DEFAULT 'sector',
  context_policy agent_context_policy NOT NULL DEFAULT 'sector_only',
  status agent_status NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE agent_type AS ENUM ('specialist', 'executive', 'governance');

CREATE TYPE agent_access_level AS ENUM (
  'sector', 'multi_sector', 'global'
);

CREATE TYPE agent_context_policy AS ENUM (
  'own_user_only',     -- só contexto do próprio usuário que está conversando
  'group_if_relevant', -- contexto de grupos relevantes ao setor
  'sector_only',       -- contexto completo do setor (default para especialistas)
  'global_executive'   -- acesso global (CEO, presidente, conselheiros)
);

CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'draft');
```

#### `audit_logs`
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action audit_action NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  status audit_status NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'login', 'logout',
  'access_denied', 'permission_change', 'role_change',
  'group_create', 'group_member_add', 'group_member_remove',
  'content_upload', 'content_delete', 'export'
);

CREATE TYPE audit_status AS ENUM ('success', 'failure', 'denied');

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- Partitioning por mês para performance (tabelas de auditoria crescem rápido)
-- Implementar quando volume justificar
```

#### `user_permissions` (Permissões Granulares)
```sql
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL, -- 'sector', 'module', 'action'
  resource_id UUID, -- sector_id, etc (NULL = all)
  permission permission_level NOT NULL,
  granted_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ, -- permissão temporária
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, resource_type, resource_id, permission)
);

CREATE TYPE permission_level AS ENUM ('read', 'write', 'manage', 'admin');
```

---

## 6. Estratégia de Memória — Modelo de 3 Camadas

### 6.1 Princípio Fundamental

> **Agentes NUNCA acessam memória bruta diretamente.** Toda informação passa por camada de processamento antes de ser disponibilizada.

### 6.2 As 3 Camadas de Memória

```
┌─────────────────────────────────────────────────────────────────┐
│                     FONTES DE DADOS                              │
│                                                                  │
│  Workspace DMs    Chat com Agente    Grupos    Transcrições     │
└───────────┬─────────────┬──────────────┬────────────┬───────────┘
            │             │              │            │
            ▼             ▼              ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 1: RAW MESSAGES (messages)                               │
│  ─────────────────────────────────                               │
│  Histórico bruto de tudo que foi falado                         │
│  Separado por tipo: workspace_dm | workspace_group | agent_chat │
│  Serve para: auditoria, histórico, rastreabilidade              │
│  Agentes: ❌ NÃO ACESSAM DIRETAMENTE                           │
│  Retenção: permanente                                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Processing   │
                    │   Pipeline    │
                    │ (filtra,      │
                    │  classifica,  │
                    │  resume)      │
                    └───────┬───────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 2: PROCESSED MEMORY (processed_memory)                   │
│  ─────────────────────────────────────────────                   │
│  Memória filtrada e organizada                                  │
│  Extrai apenas informações relevantes                           │
│  Classificada por setor, origem, relevância                     │
│  Agentes: ⚠️ ACESSO PARCIAL (conforme context_policy)          │
│  Retenção: permanente (com score de relevância)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Validation   │
                    │   Pipeline    │
                    │ (valida,      │
                    │  estrutura,   │
                    │  embeds)      │
                    └───────┬───────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 3: KNOWLEDGE MEMORY (knowledge_memory)                   │
│  ─────────────────────────────────────────────                   │
│  Conhecimento validado e estruturado                            │
│  Fonte principal de resposta dos agentes                        │
│  Categorizado: procedimento, política, técnico, operacional     │
│  Agentes: ✅ ACESSO PRINCIPAL (conforme context_policy)         │
│  Embeddings pgvector para busca semântica                       │
│  Retenção: permanente (com opção de expiração)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ Agente   │ │ Agente   │ │   Agente     │
        │ Setor    │ │ Setor    │ │   CEO        │
        │ (sector_ │ │ (sector_ │ │ (global_     │
        │  only)   │ │  only)   │ │  executive)  │
        └──────────┘ └──────────┘ └──────────────┘
```

### 6.3 Separação Clara de Dados

| Tabela | Conteúdo | Quem acessa | Agentes acessam? |
|--------|----------|-------------|-------------------|
| `messages` (type=dm) | Mensagens workspace entre humanos | Participantes + admin | ❌ Nunca diretamente |
| `messages` (type=group) | Mensagens de grupo | Membros + admin | ❌ Nunca diretamente |
| `messages` (type=agent) | Mensagens chat com agente | Usuário + setor admin | ❌ Nunca diretamente |
| `processed_memory` | Memória filtrada/resumida | Admin + sistema | ⚠️ Parcial (via pipeline) |
| `knowledge_memory` | Conhecimento validado | Admin + agentes | ✅ Fonte principal |
| `knowledge_docs` | Documentos originais (upload) | Setor + admin | ❌ Apenas via pipeline |

### 6.4 Política de Contexto dos Agentes (context_policy)

Cada agente opera com uma política que restringe qual memória ele pode acessar:

| Policy | Acessa knowledge_memory | Acessa processed_memory | Escopo |
|--------|:-:|:-:|--------|
| `own_user_only` | ✅ do setor | ❌ | Apenas contexto do usuário que está conversando |
| `group_if_relevant` | ✅ do setor | ⚠️ grupos do setor | Inclui contexto de grupos relevantes |
| `sector_only` | ✅ do setor | ⚠️ do setor | Contexto completo do setor (default especialistas) |
| `global_executive` | ✅ todos | ✅ todos | Acesso total (CEO, presidente, conselheiros) |

### 6.5 Fluxo de Processamento

```
1. Mensagem enviada → grava em messages (raw, Camada 1)
2. Pipeline de processamento (async):
   a. Extrai informações relevantes (filtra ruído)
   b. Classifica por tipo e relevância
   c. Atribui tags automáticas
   d. Grava em processed_memory (Camada 2)
3. Pipeline de validação (periódico ou manual):
   a. Seleciona processed_memory com alta relevância
   b. Estrutura em formato de conhecimento
   c. Gera embedding pgvector
   d. Grava em knowledge_memory (Camada 3)
4. Agente consulta knowledge_memory conforme context_policy
```

### 6.6 Regras Invioláveis

1. **Agentes NUNCA leem `messages` diretamente** — sempre via processed/knowledge
2. **Memória é derivada, nunca copiada** — pipeline transforma, não duplica
3. **Cada entrada tem rastreabilidade** — source_id/source_memory_id aponta para a origem
4. **context_policy é enforcement, não sugestão** — RLS garante no banco
5. **Dados humanos (workspace) e dados de agente (chat) são fisicamente separados** por `conversation.type`

### 6.7 Preparação para RAG/Embedding

A coluna `embedding VECTOR(1536)` na tabela `knowledge_memory` está preparada para:
1. **pgvector** instalado no Supabase (extensão nativa)
2. Geração de embeddings via OpenAI/Anthropic quando OpenSquad conectar
3. Busca semântica via `cosine_similarity` na Camada 3 apenas
4. Índice IVFFlat para performance em escala
5. Embeddings APENAS em knowledge_memory — não polui com dados brutos

---

## 7. Regras de Acesso por Perfil, Setor, Módulo e Ação

### 7.1 RLS Policies Principais

```sql
-- Profiles: cada usuário vê seu próprio perfil; admin/master_admin veem todos
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'master_admin')
    AND deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role = 'manager'
    AND p.sector_id = profiles.sector_id
    AND p.deleted_at IS NULL
  )
);

-- Messages: só participantes da conversa
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      auth.uid() = ANY(c.participant_ids)
      OR EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = c.group_id AND gm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
      )
    )
  )
);

-- Knowledge docs: por setor do usuário + admin
CREATE POLICY knowledge_select ON knowledge_docs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND (
      sector_id = knowledge_docs.sector_id
      OR role IN ('admin', 'master_admin')
    )
    AND deleted_at IS NULL
  )
);

-- Agent memory: por setor + acesso de agentes
CREATE POLICY memory_select ON agent_memory FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND (
      sector_id = agent_memory.sector_id
      OR role IN ('admin', 'master_admin')
    )
    AND deleted_at IS NULL
  )
);

-- Audit logs: somente admin/master_admin
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'master_admin')
  )
);
```

---

## 8. Checklist de Segurança

| # | Item | Status | Camada |
|---|------|--------|--------|
| 1 | Nenhum secret no frontend | Obrigatório | App |
| 2 | Toda lógica sensível no servidor (Server Actions) | Obrigatório | App |
| 3 | RLS ativado em TODAS as tabelas sensíveis | Obrigatório | DB |
| 4 | Policies por user, role, sector, scope | Obrigatório | DB |
| 5 | Rate limiting nas rotas de API (Nginx + app) | Obrigatório | Infra+App |
| 6 | Verificação de assinatura em webhooks | Obrigatório | App |
| 7 | Proteção contra privilege escalation | Obrigatório | App+DB |
| 8 | RBAC em 4 camadas (menu, rota, API, DB) | Obrigatório | Todas |
| 9 | Princípio do menor privilégio como default | Obrigatório | Todas |
| 10 | Logs de auditoria para ações críticas | Obrigatório | App |
| 11 | Logs de acesso negado | Obrigatório | App |
| 12 | Sessão segura e expiração (JWT HTTP-only cookie) | Obrigatório | App |
| 13 | 2FA para admin e master_admin (TOTP) | Obrigatório | Auth |
| 14 | Upload protegido por permissão (Supabase Storage + RLS) | Obrigatório | Storage |
| 15 | Validação server-side com Zod em TODOS inputs | Obrigatório | App |
| 16 | Soft delete e rastreabilidade | Obrigatório | DB |
| 17 | Ambientes separados (dev, staging, prod) | Obrigatório | Infra |
| 18 | Backup automatizado (pg_dump + cron) | Obrigatório | Infra |
| 19 | TLS 1.3 com HSTS | Obrigatório | Infra |
| 20 | CSP headers configurados | Obrigatório | Infra |
| 21 | XSS protection (React sanitiza por default + CSP) | Obrigatório | App |
| 22 | SQL injection prevention (Supabase SDK parametrizado) | Obrigatório | DB |
| 23 | CORS restritivo (apenas squad.liveuni.com.br) | Obrigatório | Infra |
| 24 | Sanitização de uploads (tipo, tamanho, extensão) | Obrigatório | App |
| 25 | Service role key APENAS no servidor | Obrigatório | App |

---

## 9. Plano de Deploy na VPS

### 9.1 Stack de Infraestrutura

```
squad.liveuni.com.br
        │
        ▼
┌──────────────────┐
│  Nginx           │ ← TLS termination, rate limiting, gzip
│  (reverse proxy) │ ← Static file serving
│  Port 80/443     │ ← WebSocket proxy para Realtime
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  PM2             │ ← Zero-downtime deploy
│  (process mgr)   │ ← Auto-restart on crash
│  Port 3000       │ ← Cluster mode (N workers)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Next.js Server  │ ← App principal
│  (Node.js 20)    │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  Supabase Cloud  │ ← Auth, Postgres, Storage, Realtime
│  (managed)       │ ← Backup automático incluído
└──────────────────┘
```

### 9.2 Setup da VPS

```bash
# 1. Provisionamento
- Ubuntu 22.04 LTS
- 4GB RAM mínimo (8GB recomendado)
- 2 vCPUs mínimo
- 50GB SSD

# 2. Software
- Node.js 20 LTS (via nvm)
- Nginx
- PM2 (global)
- Certbot (Let's Encrypt)
- Git
- UFW (firewall)

# 3. Segurança
- SSH key-only (senha desabilitada)
- UFW: apenas 22 (SSH), 80 (HTTP), 443 (HTTPS)
- fail2ban
- unattended-upgrades
```

### 9.3 Nginx Config

```nginx
server {
    listen 443 ssl http2;
    server_name squad.liveuni.com.br;

    ssl_certificate /etc/letsencrypt/live/squad.liveuni.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/squad.liveuni.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    location /api/auth/ {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }

    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name squad.liveuni.com.br;
    return 301 https://$host$request_uri;
}
```

### 9.4 Deploy Contínuo

```bash
# PM2 ecosystem.config.js
module.exports = {
  apps: [{
    name: 'squados',
    script: 'node_modules/.bin/next',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: '/var/log/squados/error.log',
    out_file: '/var/log/squados/out.log'
  }]
};
```

```bash
# scripts/deploy.sh
#!/bin/bash
set -e
cd /var/www/squados
git pull origin main
npm ci --production
npm run build
pm2 reload ecosystem.config.js --env production
echo "Deploy completed at $(date)"
```

### 9.5 Backup

```bash
# scripts/backup.sh (cron diário às 3am)
#!/bin/bash
BACKUP_DIR="/var/backups/squados"
DATE=$(date +%Y-%m-%d_%H%M)
mkdir -p $BACKUP_DIR

# Supabase gerencia backups do Postgres automaticamente
# Backup adicional local via pg_dump (optional, se self-hosted)
# pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup de configurações
tar czf $BACKUP_DIR/config_$DATE.tar.gz \
  /var/www/squados/.env.local \
  /etc/nginx/sites-available/squados \
  /var/www/squados/ecosystem.config.js

# Retenção: 30 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

---

## 10. MVP Recomendado (Fase 1)

### O que entra no MVP:

| Módulo | Escopo MVP |
|--------|-----------|
| **Auth** | Login, logout, sessão, middleware de proteção |
| **Usuários** | CRUD por admin, perfil, setor, role, status |
| **Setores** | 17 setores pré-cadastrados, CRUD admin |
| **Permissões** | RBAC 4 camadas, policies RLS |
| **Chat com agente** | Interface de chat, histórico, registro de memória (sem IA — placeholder para OpenSquad) |
| **Workspace DM** | Chat 1:1 entre usuários com Realtime |
| **Workspace Grupos** | Criação de grupos, mensagens, participantes |
| **Memória** | Registro automático de interações, consulta por setor |
| **Auditoria** | Logs de ações críticas e acesso negado |
| **Deploy** | VPS + Nginx + PM2 + SSL |

### O que NÃO entra no MVP:

- IA/LLM nos agentes (virá via OpenSquad)
- Busca semântica/RAG (estrutura preparada, não ativo)
- Painel executivo
- 2FA (estrutura preparada)
- Upload de arquivos (estrutura preparada)
- Painel administrativo completo (CRUD básico apenas)

---

## 11. Roadmap por Fases

### Fase 1 — Fundação (MVP) — 4-6 semanas
- [x] Arquitetura e modelagem
- [ ] Setup projeto Next.js + Supabase
- [ ] Migrations do banco de dados
- [ ] Seed dos 17 setores
- [ ] Autenticação (login/logout/sessão)
- [ ] Middleware de proteção de rotas
- [ ] CRUD de usuários (admin)
- [ ] Sistema RBAC completo
- [ ] Chat com agente (UI + histórico, sem IA)
- [ ] Workspace: chat 1:1 com Realtime
- [ ] Workspace: grupos
- [ ] Registro de memória automático
- [ ] Auditoria básica
- [ ] Deploy na VPS

### Fase 2 — Consolidação — 3-4 semanas
- [ ] Painel administrativo completo
- [ ] Ingestão de documentos/transcrições
- [ ] Base de conhecimento por setor (visualização)
- [ ] 2FA para admin/master_admin
- [ ] Upload de arquivos (Storage)
- [ ] Busca textual (full-text search Postgres)
- [ ] Notificações básicas
- [ ] Melhorias de UX

### Fase 3 — Inteligência — 3-4 semanas
- [ ] Integração OpenSquad (API de agentes)
- [ ] Agentes especialistas respondendo com IA
- [ ] Pipeline de embeddings (pgvector)
- [ ] Busca semântica
- [ ] Painel executivo básico
- [ ] Consolidação de contexto para agentes executivos

### Fase 4 — Escala — Contínuo
- [ ] Agentes executivos (CEO, presidente, conselheiros)
- [ ] Governança automatizada
- [ ] Dashboards avançados
- [ ] Analytics de uso
- [ ] Integração com sistemas externos
- [ ] Mobile-friendly / PWA
- [ ] Partitioning de tabelas de auditoria

---

## 12. Como Preparar o Sistema para OpenSquad

### 12.1 API de Integração

O SquadOS expõe endpoints para o OpenSquad consumir:

```typescript
// Endpoints que o OpenSquad consumirá:

// Memória do setor
GET  /api/agents/memory/:sectorId
POST /api/agents/memory/:sectorId

// Conhecimento do setor
GET  /api/agents/knowledge/:sectorId

// Enviar mensagem como agente
POST /api/agents/messages

// Contexto consolidado (agentes executivos)
GET  /api/agents/context/consolidated

// Webhook para receber respostas de agentes
POST /api/webhooks/agent-response
```

### 12.2 Autenticação de Agentes

```typescript
// Service role key para agentes (server-side only)
// Cada agente terá um registro na tabela agents
// OpenSquad autentica via API key + agent_id
// Rate limiting específico para agentes
```

### 12.3 Contrato de Dados

```typescript
interface AgentMemoryQuery {
  sectorId: string;
  query?: string;
  limit?: number;
  sourceTypes?: MemorySourceType[];
  dateRange?: { from: Date; to: Date };
}

interface AgentResponse {
  agentId: string;
  conversationId: string;
  content: string;
  metadata: {
    model: string;
    tokensUsed: number;
    sourcesUsed: string[];
    confidence: number;
  };
}
```

---

## 13. Decisões Arquiteturais (ADR Summary)

| ADR | Decisão | Alternativa Rejeitada | Motivo |
|-----|---------|----------------------|--------|
| ADR-001 | Monólito modular | Microserviços | Simplicidade operacional, equipe pequena, 1 VPS |
| ADR-002 | Supabase Cloud (managed) | Self-hosted Supabase | Menos ops, backup incluso, Realtime gerenciado |
| ADR-003 | Server Actions como API principal | REST API separada | Colocalização, type safety, menos boilerplate |
| ADR-004 | Feature-based architecture | Layer-based (MVC) | Coesão, facilidade de navegação, isolamento |
| ADR-005 | Zustand + React Query | Redux / Context API | Leve, sem boilerplate, separação client/server state |
| ADR-006 | PM2 cluster mode | Docker Compose | Menos overhead, deploy simples, suficiente para 1 VPS |
| ADR-007 | pgvector nativo | Pinecone / Weaviate | Zero custo extra, integrado ao Supabase, suficiente |
| ADR-008 | RBAC em 4 camadas | 1 camada (apenas API) | Defense in depth, zero trust |
| ADR-009 | Supabase Realtime | Socket.io / Pusher | Nativo, RLS integrado, zero infra extra |
| ADR-010 | Soft delete | Hard delete | Rastreabilidade, recuperação, auditoria |

---

*Arquitetura SquadOS v1.0.0 — Aria, arquitetando o futuro 🏗️*
